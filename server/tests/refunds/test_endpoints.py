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
from polar.models.refund import RefundReason
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
    async def create(
        self,
        client: AsyncClient,
        stripe_service_mock: MagicMock,
        order: Order,
        payment: Transaction,
        create_schema: RefundCreate,
    ) -> Response:
        refund_amount, refund_tax_amount = refund_service.calculate_refund_amounts(
            order, create_schema.amount
        )
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
                "order_id": str(order.id),
                "reason": str(RefundReason.service_disruption),
                "amount": 1110,
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
        response = await self.create(
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
            # Technically 2_497.5, but rounds up (at Stripe too) at purchase
            tax_amount=2_498,
        )

        await self.create_and_assert(
            client,
            stripe_service_mock,
            order,
            payment,
            RefundCreate(
                order_id=order.id,
                reason=RefundReason.service_disruption,
                amount=1_110,
            ),
            expected={
                "status": "succeeded",
                "reason": "service_disruption",
                "amount": 1_110,
                # Refunds round down to closest cent (conservative in aggregate)
                "tax_amount": 277,
            },
        )

        # TODO: Check order stats to be reflective of refund progress
        # 8_880 remaining
        await self.create_and_assert(
            client,
            stripe_service_mock,
            order,
            payment,
            RefundCreate(
                order_id=order.id,
                reason=RefundReason.service_disruption,
                amount=993,
            ),
            expected={
                "status": "succeeded",
                "reason": "service_disruption",
                "amount": 993,
                "tax_amount": 248,
            },
        )

        # 7_887 remaining
        await self.create_and_assert(
            client,
            stripe_service_mock,
            order,
            payment,
            RefundCreate(
                order_id=order.id,
                reason=RefundReason.service_disruption,
                amount=5_887,
            ),
            expected={
                "status": "succeeded",
                "reason": "service_disruption",
                "amount": 5_887,
                "tax_amount": 1_472,
            },
        )

        # 2_000 remaining
        # Once we track order status - add test to refund too much
        # await self.create_and_assert(
        #     client,
        #     stripe_service_mock,
        #     order,
        #     payment,
        #     RefundCreate(
        #         order_id=order.id,
        #         reason=RefundReason.service_disruption,
        #         amount=3_000,  # Too high
        #     ),
        #     expected_status=400,
        # )

        await self.create_and_assert(
            client,
            stripe_service_mock,
            order,
            payment,
            RefundCreate(
                order_id=order.id,
                reason=RefundReason.service_disruption,
                amount=2_000,
            ),
            expected={
                "status": "succeeded",
                "reason": "service_disruption",
                "amount": 2_000,
                "tax_amount": 500,
            },
        )
