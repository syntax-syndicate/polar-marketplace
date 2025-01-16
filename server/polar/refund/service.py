from typing import Literal, TypeAlias
from uuid import UUID

import stripe as stripe_lib
import structlog

from polar.enums import PaymentProcessor
from polar.exceptions import PolarError, ResourceNotFound
from polar.integrations.stripe.service import stripe as stripe_service
from polar.kit.db.postgres import AsyncSession
from polar.kit.services import ResourceServiceReader
from polar.logging import Logger
from polar.models import Order, Pledge, Transaction
from polar.models.refund import Refund, RefundFailureReason, RefundReason
from polar.order.service import order as order_service
from polar.pledge.service import pledge as pledge_service
from polar.transaction.service.payment import (
    payment_transaction as payment_transaction_service,
)
from polar.transaction.service.refund import (
    refund_transaction as refund_transaction_service,
)

from .schemas import RefundCreate

log: Logger = structlog.get_logger()

ChargeID: TypeAlias = str
RefundTransaction: TypeAlias = Transaction
RefundedResources: TypeAlias = tuple[
    ChargeID, RefundTransaction, Order | None, Pledge | None
]
Created: TypeAlias = bool
RefundAmount: TypeAlias = int
RefundTaxAmount: TypeAlias = int
FullRefund: TypeAlias = bool


class RefundError(PolarError): ...


class RefundUnknownPayment(ResourceNotFound):
    def __init__(
        self, id: str | UUID, payment_type: Literal["charge", "order", "pledge"]
    ) -> None:
        self.id = id
        message = f"Refund issued for unknown {payment_type}: {id}"
        super().__init__(message, 404)


class RefundedAlready(RefundError):
    def __init__(self, order: Order) -> None:
        self.order = order
        message = f"Order is already fully refunded: {order.id}"
        super().__init__(message, 403)


class RefundAmountTooHigh(RefundError):
    def __init__(self, order: Order) -> None:
        self.order = order
        message = (
            f"Refund amount exceeds remaining order balance: {order.refundable_amount}"
        )
        super().__init__(message, 400)


class RefundService(ResourceServiceReader[Refund]):
    ###############################################################################
    # API HANDLERS
    ###############################################################################

    async def create(
        self, session: AsyncSession, order: Order, create_schema: RefundCreate
    ) -> Refund:
        if order.refunded:
            raise RefundedAlready(order)

        refund_amount = create_schema.amount
        refund_tax_amount = self.calculate_tax(order, create_schema.amount)
        payment = await payment_transaction_service.get_by_order_id(session, order.id)
        if not (payment and payment.charge_id):
            raise RefundUnknownPayment(order.id, payment_type="order")

        refund_total = refund_amount + refund_tax_amount
        stripe_refund = await stripe_service.create_refund(
            charge_id=payment.charge_id,
            amount=refund_total,
            reason=RefundReason.to_stripe(create_schema.reason),
        )
        # Set base from Stripe
        refund = await self._create_from_stripe(session, stripe_refund)
        # Override custom attributes
        refund.reason = create_schema.reason
        refund.comment = create_schema.comment
        return refund

    def calculate_tax(
        self,
        order: Order,
        refund_amount: int,
    ) -> int:
        if refund_amount > order.refundable_amount:
            raise RefundAmountTooHigh(order)

        # Trigger full refund of remaining balance
        if refund_amount == order.refundable_amount:
            return order.refundable_tax_amount

        ratio = order.tax_amount / order.amount
        tax_amount = round(refund_amount * ratio)
        return tax_amount

    ###############################################################################
    # STRIPE WEBHOOK HANDLERS
    ###############################################################################

    async def upsert_from_stripe(
        self, session: AsyncSession, stripe_refund: stripe_lib.Refund
    ) -> Refund:
        refund = await self.get_by(session, stripe_id=stripe_refund.id)
        if refund:
            return await self._update_from_stripe(session, refund, stripe_refund)
        return await self._create_from_stripe(session, stripe_refund)

    async def handle_refunded_stripe_charge(
        self, session: AsyncSession, charge: stripe_lib.Charge
    ) -> None:
        _, payment, order, pledge = await self._get_resources_from_stripe_charge(
            session, charge
        )

        stripe_amount = charge.amount_refunded
        if order is not None:
            refunded_amount, refunded_tax_amount = self.calculate_stripe_amounts(
                order, stripe_amount=stripe_amount
            )
            await order_service.increment_refunds(
                session,
                order,
                refunded_amount=refunded_amount,
                refunded_tax_amount=refunded_tax_amount,
            )
        elif pledge is not None:
            await pledge_service.refund_by_payment_id(
                session=session,
                payment_id=charge["payment_intent"],
                amount=stripe_amount,
                transaction_id=charge["id"],
            )

        # TODO: Webhook for order.refunded

    def calculate_stripe_amounts(
        self,
        order: Order,
        stripe_amount: int,
    ) -> tuple[RefundAmount, RefundTaxAmount]:
        remaining_balance = order.get_remaining_balance()
        if stripe_amount == remaining_balance:
            return order.refundable_amount, order.refundable_tax_amount

        refunded_tax_amount = abs(
            round((order.tax_amount * stripe_amount) / order.total)
        )
        refunded_amount = stripe_amount - refunded_tax_amount
        return refunded_amount, refunded_tax_amount

    def build_instance_from_stripe(
        self,
        stripe_refund: stripe_lib.Refund,
        *,
        order: Order | None = None,
        pledge: Pledge | None = None,
    ) -> Refund:
        refunded_amount = stripe_refund.amount
        refunded_tax_amount = 0
        # Pledges never have VAT
        if order:
            refunded_amount, refunded_tax_amount = self.calculate_stripe_amounts(
                order,
                stripe_amount=stripe_refund.amount,
            )

        failure_reason = getattr(stripe_refund, "failure_reason", None)
        stripe_reason = stripe_refund.reason if stripe_refund.reason else "other"
        instance = Refund(
            status=stripe_refund.status,
            reason=RefundReason.from_stripe(stripe_refund.reason),
            amount=refunded_amount,
            tax_amount=refunded_tax_amount,
            currency=stripe_refund.currency,
            failure_reason=RefundFailureReason.from_stripe(failure_reason),
            destination_details=stripe_refund.destination_details,
            order=order,
            pledge=pledge,
            processor=PaymentProcessor.stripe,
            processor_id=stripe_refund.id,
            processor_receipt_number=stripe_refund.receipt_number,
            processor_reason=stripe_reason,
            processor_balance_transaction_id=stripe_refund.balance_transaction,
        )
        return instance

    async def _create_from_stripe(
        self, session: AsyncSession, stripe_refund: stripe_lib.Refund
    ) -> Refund:
        resources = await self._get_resources_from_stripe_refund(session, stripe_refund)
        charge_id, payment, order, pledge = resources

        instance = self.build_instance_from_stripe(
            stripe_refund,
            order=order,
            pledge=pledge,
        )
        session.add(instance)
        if order is not None:
            await order_service.increment_refunds(
                session,
                order,
                refunded_amount=instance.amount,
                refunded_tax_amount=instance.tax_amount,
            )

        await refund_transaction_service.create(
            session,
            charge_id=charge_id,
            payment_transaction=payment,
            refund=instance,
        )
        await session.flush()
        # TODO: Webhooks on refund.created
        log.info(
            "refund.create",
            id=instance.id,
            amount=instance.amount,
            tax_amount=instance.tax_amount,
            order_id=instance.order_id,
            pledge_id=instance.pledge_id,
            reason=instance.reason,
            processor=instance.processor,
            processor_id=instance.processor_id,
        )
        return instance

    async def _update_from_stripe(
        self,
        session: AsyncSession,
        refund: Refund,
        stripe_refund: stripe_lib.Refund,
    ) -> Refund:
        resources = await self._get_resources_from_stripe_refund(session, stripe_refund)
        charge_id, payment, order, pledge = resources
        updated = self.build_instance_from_stripe(
            stripe_refund,
            order=order,
            pledge=pledge,
        )

        refund_succeeded_before_update = refund.succeeded

        # Reference: https://docs.stripe.com/refunds#see-also
        # Only `metadata` and `destination_details` should update according to
        # docs, but a pending refund can surely become `succeeded`, `canceled` or `failed`
        refund.status = updated.status
        refund.failure_reason = updated.failure_reason
        refund.destination_details = updated.destination_details
        refund.processor_receipt_number = updated.processor_receipt_number
        refund.set_modified()
        session.add(refund)

        log.info(
            "refund.updated",
            id=refund.id,
            amount=refund.amount,
            tax_amount=refund.tax_amount,
            order_id=refund.order_id,
            reason=refund.reason,
            processor=refund.processor,
            processor_id=refund.processor_id,
        )

        # TODO: Possible for the reverse, i.e need to reverse refund?
        if not refund_succeeded_before_update and refund.succeeded:
            await refund_transaction_service.create(
                session,
                charge_id=charge_id,
                payment_transaction=payment,
                refund=refund,
            )
            # TODO: Webhooks on refund.update

        await session.flush()
        return refund

    async def _get_resources_from_stripe_refund(
        self, session: AsyncSession, refund: stripe_lib.Refund
    ) -> RefundedResources:
        if not refund.charge:
            raise RefundUnknownPayment(refund.id, payment_type="charge")

        payment_intent = str(refund.payment_intent) if refund.payment_intent else None
        return await self._get_resources(session, str(refund.charge), payment_intent)

    async def _get_resources_from_stripe_charge(
        self, session: AsyncSession, charge: stripe_lib.Charge
    ) -> RefundedResources:
        payment_intent = str(charge.payment_intent) if charge.payment_intent else None
        return await self._get_resources(session, str(charge.id), payment_intent)

    async def _get_resources(
        self, session: AsyncSession, charge_id: str, payment_intent: str | None
    ) -> RefundedResources:
        payment = await payment_transaction_service.get_by_charge_id(session, charge_id)
        if payment is None:
            raise RefundUnknownPayment(charge_id, payment_type="charge")

        if payment.order_id:
            order = await order_service.get(
                session, payment.order_id, allow_deleted=True
            )
            if not order:
                raise RefundUnknownPayment(payment.order_id, payment_type="order")

            return (charge_id, payment, order, None)

        if not (payment.pledge_id and payment_intent):
            raise RefundUnknownPayment(payment.id, payment_type="charge")

        pledge = await pledge_service.get_by_payment_id(
            session,
            payment_id=payment_intent,
        )
        if pledge is None:
            raise RefundUnknownPayment(payment.pledge_id, payment_type="pledge")

        return (charge_id, payment, None, pledge)


refund = RefundService(Refund)
