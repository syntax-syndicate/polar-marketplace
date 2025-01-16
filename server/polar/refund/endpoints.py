from typing import Annotated

import structlog
from fastapi import Depends, Path
from pydantic import UUID4

from polar.exceptions import ResourceNotFound
from polar.models import Refund
from polar.openapi import APITag
from polar.order.service import order as order_service
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from . import auth
from .schemas import Refund as RefundSchema
from .schemas import RefundCreate
from .service import RefundAmountTooHigh, RefundedAlready
from .service import refund as refund_service

log = structlog.get_logger()

router = APIRouter(prefix="/refunds", tags=["refunds", APITag.documented])

RefundID = Annotated[UUID4, Path(description="The subscription ID.")]
OrderNotFound = {
    "description": "Order not found.",
    "model": ResourceNotFound.schema(),
}


@router.post(
    "/",
    summary="Create Refund",
    response_model=RefundSchema,
    responses={
        201: {"description": "Refund created."},
        400: {
            "description": "Refund amount exceeds remaining order balance.",
            "model": RefundAmountTooHigh.schema(),
        },
        403: {
            "description": "Order is already fully refunded.",
            "model": RefundedAlready.schema(),
        },
        404: OrderNotFound,
    },
)
async def create(
    refund_create: RefundCreate,
    auth_subject: auth.RefundsWrite,
    session: AsyncSession = Depends(get_db_session),
) -> Refund:
    """Create a refund."""
    order = await order_service.get_by_id(session, auth_subject, refund_create.order_id)
    if not order:
        raise ResourceNotFound()

    return await refund_service.create(session, order, create_schema=refund_create)
