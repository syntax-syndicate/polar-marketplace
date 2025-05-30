"""Add Checkout.custom_field_data

Revision ID: b48947c6b083
Revises: 76d3895ffd2a
Create Date: 2024-10-31 10:15:30.617842

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "b48947c6b083"
down_revision = "76d3895ffd2a"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column(
        "checkouts",
        sa.Column(
            "custom_field_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
    )

    op.execute(
        """
        UPDATE checkouts
        SET custom_field_data = '{}'
        """
    )

    op.alter_column("checkouts", "custom_field_data", nullable=False)

    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column("checkouts", "custom_field_data")
    # ### end Alembic commands ###
