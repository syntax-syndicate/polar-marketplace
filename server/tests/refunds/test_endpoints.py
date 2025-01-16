from typing import Any
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient, Response
from pytest_mock import MockerFixture

from polar.auth.scope import Scope
from polar.integrations.stripe.service import StripeService
from polar.models import (
    Customer,
    Order,
    Organization,
    Product,
    Transaction,
    UserOrganization,
)
from polar.models.order import OrderStatus
from polar.models.refund import RefundReason
from polar.order.service import order as order_service
from polar.postgres import AsyncSession
from polar.refund.schemas import RefundCreate
from polar.refund.service import refund as refund_service
from tests.fixtures import random_objects as ro
from tests.fixtures.auth import AuthSubjectFixture
from tests.fixtures.database import SaveFixture
from tests.fixtures.stripe import build_stripe_refund


@pytest.fixture(autouse=True)
def stripe_service_mock(mocker: MockerFixture) -> MagicMock:
    mock = MagicMock(spec=StripeService)
    mocker.patch("polar.refund.service.stripe_service", new=mock)
    return mock


async def create_order_and_payment(
    save_fixture: SaveFixture,
    *,
    product: Product,
    customer: Customer,
    amount: int,
    tax_amount: int,
) -> tuple[Order, Transaction]:
    order = await ro.create_order(
        save_fixture,
        product=product,
        customer=customer,
        amount=amount,
        tax_amount=tax_amount,
    )
    payment = await ro.create_payment_transaction(
        save_fixture, amount=amount, tax_amount=tax_amount, order=order
    )
    return order, payment


class StripeRefund:
    async def calculate_and_create(
        self,
        client: AsyncClient,
        stripe_service_mock: MagicMock,
        order: Order,
        payment: Transaction,
        create_schema: RefundCreate,
    ) -> Response:
        refund_amount = create_schema.amount
        refund_tax_amount = refund_service.calculate_tax(order, refund_amount)
        return await self.create(
            client,
            stripe_service_mock,
            order,
            payment,
            create_schema,
            refund_amount=refund_amount,
            refund_tax_amount=refund_tax_amount,
        )

    async def create(
        self,
        client: AsyncClient,
        stripe_service_mock: MagicMock,
        order: Order,
        payment: Transaction,
        create_schema: RefundCreate,
        *,
        refund_amount: int,
        refund_tax_amount: int,
    ) -> Response:
        if not payment.charge_id:
            raise RuntimeError()

        stripe_refund = build_stripe_refund(
            amount=(refund_amount + refund_tax_amount),
            charge_id=payment.charge_id,
        )
        stripe_service_mock.create_refund.return_value = stripe_refund
        response = await client.post(
            "/v1/refunds/",
            json={
                "order_id": str(create_schema.order_id),
                "reason": str(create_schema.reason),
                "amount": refund_amount,
            },
        )
        return response

    async def create_and_assert(
        self,
        client: AsyncClient,
        stripe_service_mock: MagicMock,
        order: Order,
        payment: Transaction,
        create_schema: RefundCreate,
        expected: dict[str, Any] = {},
        expected_status: int = 200,
    ) -> Response:
        response = await self.calculate_and_create(
            client,
            stripe_service_mock,
            order,
            payment,
            create_schema,
        )

        # TODO: Why 200 vs. 201?
        assert response.status_code == expected_status
        if not expected:
            return response

        data = response.json()
        for k, v in expected.items():
            assert data[k] == v

        return response

    async def create_partial_order_refund(
        self,
        session: AsyncSession,
        client: AsyncClient,
        stripe_service_mock: MagicMock,
        order: Order,
        payment: Transaction,
        *,
        amount: int,
        tax: int,
    ) -> Order:
        refunded_amount = order.refunded_amount
        refunded_tax_amount = order.refunded_tax_amount

        await self.create_and_assert(
            client,
            stripe_service_mock,
            order,
            payment,
            RefundCreate(
                order_id=order.id,
                reason=RefundReason.service_disruption,
                amount=amount,
            ),
            expected={
                "status": "succeeded",
                "reason": "service_disruption",
                "amount": amount,
                # Refunds round down to closest cent (conservative in aggregate)
                "tax_amount": tax,
            },
        )
        refunded_amount += amount
        refunded_tax_amount += tax

        updated = await order_service.get(session, order.id)
        if not updated:
            raise RuntimeError()

        assert updated.refunded_amount == refunded_amount
        assert updated.refunded_tax_amount == refunded_tax_amount
        return updated


@pytest.mark.asyncio
class TestCreatePartialRefunds(StripeRefund):
    async def test_anonymous(
        self, client: AsyncClient, organization: Organization
    ) -> None:
        response = await client.post("/v1/refunds/")
        assert response.status_code == 401

    @pytest.mark.auth(
        AuthSubjectFixture(scopes={Scope.web_default}),
        # AuthSubjectFixture(scopes={Scope.refunds_write}),
    )
    async def test_valid_partial_to_refunded(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,  # makes User a member of Organization
        stripe_service_mock: MagicMock,
        product: Product,
        customer: Customer,
    ) -> None:
        # Complex Swedish order. $99.9 with 25% VAT = $24.75
        order, payment = await create_order_and_payment(
            save_fixture,
            product=product,
            customer=customer,
            amount=9_990,
            # Rounded up from 2_497.5. Stripe rounds cents too.
            # Required and expected by tax authorities, e.g Sweden.
            tax_amount=2_498,
        )

        order = await self.create_partial_order_refund(
            session,
            client,
            stripe_service_mock,
            order,
            payment,
            amount=1110,
            # Rounded up from 277.5
            tax=278,
        )
        assert order.status == OrderStatus.partially_refunded

        # 8_880 remaining
        order = await self.create_partial_order_refund(
            session,
            client,
            stripe_service_mock,
            order,
            payment,
            amount=993,
            # Rounded down from 248.25
            tax=248,
        )
        assert order.status == OrderStatus.partially_refunded

        # 7_887 remaining
        order = await self.create_partial_order_refund(
            session,
            client,
            stripe_service_mock,
            order,
            payment,
            amount=5887,
            # Rounds up from 1471.75
            tax=1472,
        )
        assert order.status == OrderStatus.partially_refunded

        # 2_000 remaining
        amount_before_exceed_attempt = order.refunded_amount
        tax_before_exceed_attempt = order.refunded_tax_amount
        response = await self.create(
            client,
            stripe_service_mock,
            order,
            payment,
            RefundCreate(
                order_id=order.id,
                reason=RefundReason.service_disruption,
                amount=2001,
            ),
            refund_amount=2001,
            # Rounds down from 500.25
            refund_tax_amount=500,
        )
        assert response.status_code == 400
        order = await order_service.get(session, order.id)
        assert order
        assert order.refunded_amount == amount_before_exceed_attempt
        assert order.refunded_tax_amount == tax_before_exceed_attempt
        assert order.refundable_amount == 2000

        # Still 2_000 remaining
        order = await self.create_partial_order_refund(
            session,
            client,
            stripe_service_mock,
            order,
            payment,
            amount=2000,
            tax=order.tax_amount - order.refunded_tax_amount,
        )
        assert order.status == OrderStatus.refunded
        assert order.refunded
