"""empty message

Revision ID: 15523c0cec88
Revises: 
Create Date: 2025-08-14 22:05:43.171921

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '15523c0cec88'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    columns = [col['name'] for col in inspector.get_columns('user')]

    with op.batch_alter_table('user', schema=None) as batch_op:
        if 'reset_token' not in columns:
            batch_op.add_column(sa.Column('reset_token', sa.String(length=100), nullable=True))
        if 'reset_token_expires' not in columns:
            batch_op.add_column(sa.Column('reset_token_expires', sa.DateTime(), nullable=True))



def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        if 'reset_token_expires' in [col['name'] for col in inspect(op.get_bind()).get_columns('user')]:
            batch_op.drop_column('reset_token_expires')
        if 'reset_token' in [col['name'] for col in inspect(op.get_bind()).get_columns('user')]:
            batch_op.drop_column('reset_token')
