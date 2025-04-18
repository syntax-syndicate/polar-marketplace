import functools
import uuid
from collections.abc import Awaitable, Callable
from typing import ParamSpec, TypeVar, cast

import stripe as stripe_lib
import structlog
from arq import Retry

from polar.account.service import account as account_service
from polar.checkout.service import NotConfirmedCheckout
from polar.checkout.service import checkout as checkout_service
from polar.exceptions import PolarTaskError
from polar.external_event.service import external_event as external_event_service
from polar.integrations.stripe.schemas import PaymentIntentSuccessWebhook, ProductType
from polar.logging import Logger
from polar.order.service import (
    NotAnOrderInvoice,
    NotASubscriptionInvoice,
    OrderDoesNotExist,
)
from polar.order.service import (
    SubscriptionDoesNotExist as OrderSubscriptionDoesNotExist,
)
from polar.order.service import order as order_service
from polar.pledge.service import pledge as pledge_service
from polar.refund.service import refund as refund_service
from polar.subscription.service import SubscriptionDoesNotExist
from polar.subscription.service import subscription as subscription_service
from polar.transaction.service.dispute import (
    dispute_transaction as dispute_transaction_service,
)
from polar.transaction.service.payment import (
    PledgeDoesNotExist as PaymentTransactionPledgeDoesNotExist,
)
from polar.transaction.service.payment import (
    payment_transaction as payment_transaction_service,
)
from polar.transaction.service.payout import (
    payout_transaction as payout_transaction_service,
)
from polar.worker import AsyncSessionMaker, JobContext, compute_backoff, task

from .service import stripe as stripe_service

log: Logger = structlog.get_logger()

MAX_RETRIES = 10

Params = ParamSpec("Params")
ReturnValue = TypeVar("ReturnValue")


def stripe_api_connection_error_retry(
    func: Callable[Params, Awaitable[ReturnValue]],
) -> Callable[Params, Awaitable[ReturnValue]]:
    @functools.wraps(func)
    async def wrapper(*args: Params.args, **kwargs: Params.kwargs) -> ReturnValue:
        try:
            return await func(*args, **kwargs)
        except stripe_lib.APIConnectionError as e:
            ctx = cast(JobContext, args[0])
            job_try = ctx["job_try"]
            log.warning(
                "Retry after Stripe API connection error", e=str(e), job_try=job_try
            )
            raise Retry(compute_backoff(job_try)) from e

    return wrapper


class StripeTaskError(PolarTaskError): ...


class UnsetAccountOnPayoutEvent(StripeTaskError):
    def __init__(self, event_id: uuid.UUID) -> None:
        self.event_id = event_id
        message = (
            f"Received the payout.paid event {event_id}, "
            "but the connected account is not set"
        )
        super().__init__(message)


@task("stripe.webhook.account.updated")
@stripe_api_connection_error_retry
async def account_updated(ctx: JobContext, event_id: uuid.UUID) -> None:
    async with AsyncSessionMaker(ctx) as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            stripe_account = cast(stripe_lib.Account, event.stripe_data.data.object)
            await account_service.update_account_from_stripe(
                session, stripe_account=stripe_account
            )


@task("stripe.webhook.payment_intent.succeeded", max_tries=MAX_RETRIES)
@stripe_api_connection_error_retry
async def payment_intent_succeeded(ctx: JobContext, event_id: uuid.UUID) -> None:
    async with AsyncSessionMaker(ctx) as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            payment_intent = cast(
                stripe_lib.PaymentIntent, event.stripe_data.data.object
            )
            payload = PaymentIntentSuccessWebhook.model_validate(payment_intent)
            metadata = payment_intent.get("metadata", {})

            # Payment for Polar Checkout Session
            if (
                metadata.get("type") == ProductType.product
                and (checkout_id := metadata.get("checkout_id")) is not None
            ):
                try:
                    await checkout_service.handle_stripe_success(
                        session, uuid.UUID(checkout_id), payment_intent
                    )
                except NotConfirmedCheckout as e:
                    # Retry because we've seen in the wild a Stripe webhook coming
                    # *before* we updated the Checkout Session status in the database!
                    if ctx["job_try"] <= MAX_RETRIES:
                        raise Retry(compute_backoff(ctx["job_try"])) from e
                    # Raise the exception to be notified about it
                    else:
                        raise
                return

            # payment for pay_on_completion
            # metadata is on the invoice, not the payment_intent
            if payload.invoice:
                invoice = await stripe_service.get_invoice(payload.invoice)
                if (
                    invoice.metadata
                    and invoice.metadata.get("type") == ProductType.pledge
                ):
                    await pledge_service.handle_payment_intent_success(
                        session=session,
                        payload=payload,
                    )
                return

            log.error(
                "stripe.webhook.payment_intent.succeeded.not_handled",
                pi=payload.id,
            )


@task("stripe.webhook.payment_intent.payment_failed")
@stripe_api_connection_error_retry
async def payment_intent_payment_failed(ctx: JobContext, event_id: uuid.UUID) -> None:
    async with AsyncSessionMaker(ctx) as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            async with AsyncSessionMaker(ctx) as session:
                payment_intent = cast(
                    stripe_lib.PaymentIntent, event.stripe_data.data.object
                )
                metadata = payment_intent.metadata or {}

                # Payment for Polar Checkout Session
                if (
                    metadata.get("type") == ProductType.product
                    and (checkout_id := metadata.get("checkout_id")) is not None
                ):
                    await checkout_service.handle_stripe_failure(
                        session, uuid.UUID(checkout_id), payment_intent
                    )


@task("stripe.webhook.charge.succeeded", max_tries=MAX_RETRIES)
@stripe_api_connection_error_retry
async def charge_succeeded(ctx: JobContext, event_id: uuid.UUID) -> None:
    async with AsyncSessionMaker(ctx) as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            charge = cast(stripe_lib.Charge, event.stripe_data.data.object)
            try:
                await payment_transaction_service.create_payment(
                    session=session, charge=charge
                )
            except PaymentTransactionPledgeDoesNotExist as e:
                log.warning(e.message, event_id=event.id)
                # Retry because we might not have been able to handle other events
                # triggering the creation of Pledge and Subscription
                if ctx["job_try"] <= MAX_RETRIES:
                    raise Retry(compute_backoff(ctx["job_try"])) from e
                # Raise the exception to be notified about it
                else:
                    raise


@task("stripe.webhook.refund.created")
@stripe_api_connection_error_retry
async def refund_created(ctx: JobContext, event_id: uuid.UUID) -> None:
    async with AsyncSessionMaker(ctx) as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            refund = cast(stripe_lib.Refund, event.stripe_data.data.object)
            log.info(
                "stripe.webhook.refund.created",
                refund_id=refund.id,
                charge_id=refund.charge,
                payment_intent=refund.payment_intent,
            )
            await refund_service.create_from_stripe(session, stripe_refund=refund)


@task("stripe.webhook.refund.updated")
@stripe_api_connection_error_retry
async def refund_updated(ctx: JobContext, event_id: uuid.UUID) -> None:
    async with AsyncSessionMaker(ctx) as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            refund = cast(stripe_lib.Refund, event.stripe_data.data.object)
            log.info(
                "stripe.webhook.refund.updated",
                refund_id=refund.id,
                charge_id=refund.charge,
                payment_intent=refund.payment_intent,
            )
            await refund_service.upsert_from_stripe(session, stripe_refund=refund)


@task("stripe.webhook.refund.failed")
@stripe_api_connection_error_retry
async def refund_failed(ctx: JobContext, event_id: uuid.UUID) -> None:
    async with AsyncSessionMaker(ctx) as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            refund = cast(stripe_lib.Refund, event.stripe_data.data.object)
            log.info(
                "stripe.webhook.refund.failed",
                refund_id=refund.id,
                charge_id=refund.charge,
                payment_intent=refund.payment_intent,
            )
            await refund_service.upsert_from_stripe(session, stripe_refund=refund)


@task("stripe.webhook.charge.dispute.closed")
@stripe_api_connection_error_retry
async def charge_dispute_closed(ctx: JobContext, event_id: uuid.UUID) -> None:
    async with AsyncSessionMaker(ctx) as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            dispute = cast(stripe_lib.Dispute, event.stripe_data.data.object)

            await dispute_transaction_service.create_dispute(session, dispute=dispute)


@task("stripe.webhook.customer.subscription.updated", max_tries=MAX_RETRIES)
@stripe_api_connection_error_retry
async def customer_subscription_updated(ctx: JobContext, event_id: uuid.UUID) -> None:
    async with AsyncSessionMaker(ctx) as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            subscription = cast(stripe_lib.Subscription, event.stripe_data.data.object)
            try:
                await subscription_service.update_subscription_from_stripe(
                    session, stripe_subscription=subscription
                )
            except SubscriptionDoesNotExist as e:
                log.warning(e.message, event_id=event.id)
                # Retry because Stripe webhooks order is not guaranteed,
                # so we might not have been able to handle subscription.created yet!
                if ctx["job_try"] <= MAX_RETRIES:
                    raise Retry(compute_backoff(ctx["job_try"])) from e
                # Raise the exception to be notified about it
                else:
                    raise


@task("stripe.webhook.customer.subscription.deleted", max_tries=MAX_RETRIES)
@stripe_api_connection_error_retry
async def customer_subscription_deleted(ctx: JobContext, event_id: uuid.UUID) -> None:
    async with AsyncSessionMaker(ctx) as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            subscription = cast(stripe_lib.Subscription, event.stripe_data.data.object)
            try:
                await subscription_service.update_subscription_from_stripe(
                    session, stripe_subscription=subscription
                )
            except SubscriptionDoesNotExist as e:
                log.warning(e.message, event_id=event.id)
                # Retry because Stripe webhooks order is not guaranteed,
                # so we might not have been able to handle subscription.created yet!
                if ctx["job_try"] <= MAX_RETRIES:
                    raise Retry(compute_backoff(ctx["job_try"])) from e
                # Raise the exception to be notified about it
                else:
                    raise


@task("stripe.webhook.invoice.created", max_tries=MAX_RETRIES)
@stripe_api_connection_error_retry
async def invoice_created(ctx: JobContext, event_id: uuid.UUID) -> None:
    async with AsyncSessionMaker(ctx) as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            invoice = cast(stripe_lib.Invoice, event.stripe_data.data.object)
            try:
                await order_service.create_order_from_stripe(session, invoice=invoice)
            except OrderSubscriptionDoesNotExist as e:
                log.warning(e.message, event_id=event.id)
                # Retry because Stripe webhooks order is not guaranteed,
                # so we might not have been able to handle subscription.created yet!
                if ctx["job_try"] <= MAX_RETRIES:
                    raise Retry(compute_backoff(ctx["job_try"])) from e
                # Raise the exception to be notified about it
                else:
                    raise
            except (NotAnOrderInvoice, NotASubscriptionInvoice):
                # Ignore invoices that are not for products (pledges) and subscriptions
                return


@task("stripe.webhook.invoice.paid", max_tries=MAX_RETRIES)
@stripe_api_connection_error_retry
async def invoice_paid(ctx: JobContext, event_id: uuid.UUID) -> None:
    async with AsyncSessionMaker(ctx) as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            invoice = cast(stripe_lib.Invoice, event.stripe_data.data.object)
            try:
                await order_service.update_order_from_stripe(session, invoice=invoice)
            except OrderDoesNotExist as e:
                log.warning(e.message, event_id=event.id)
                # Retry because Stripe webhooks order is not guaranteed,
                # so we might not have been able to handle invoice.created yet!
                if ctx["job_try"] <= MAX_RETRIES:
                    raise Retry(compute_backoff(ctx["job_try"])) from e
                # Raise the exception to be notified about it
                else:
                    raise


@task("stripe.webhook.payout.paid")
@stripe_api_connection_error_retry
async def payout_paid(ctx: JobContext, event_id: uuid.UUID) -> None:
    async with AsyncSessionMaker(ctx) as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            account = event.stripe_data.account
            if account is None:
                raise UnsetAccountOnPayoutEvent(event.id)
            payout = cast(stripe_lib.Payout, event.stripe_data.data.object)
            await payout_transaction_service.create_payout_from_stripe(
                session, payout=payout, stripe_account_id=account
            )
