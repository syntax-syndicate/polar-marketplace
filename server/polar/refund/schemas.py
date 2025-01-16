from typing import Annotated

from pydantic import UUID4

from polar.kit.metadata import (
    MetadataInputMixin,
    MetadataOutputMixin,
)
from polar.kit.schemas import (
    MergeJSONSchema,
    Schema,
    SelectorWidget,
)
from polar.models.refund import (
    RefundReason,
    RefundStatus,
)

RefundID = Annotated[
    UUID4,
    MergeJSONSchema({"description": "The refund ID."}),
    SelectorWidget("/v1/refunds", "Refund", "name"),
]


class RefundBase(Schema):
    status: RefundStatus
    reason: RefundReason
    amount: int
    tax_amount: int
    currency: str


class Refund(MetadataOutputMixin, RefundBase):
    id: RefundID


class RefundUpdate(MetadataInputMixin, Schema):
    id: RefundID


class RefundCreate(MetadataInputMixin, Schema):
    order_id: UUID4
    reason: RefundReason
    amount: int
    comment: str | None = None
