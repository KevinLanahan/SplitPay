"""Add created_at to FriendRequest; make GroupInvite.created_at non-null; drop duplicate timestamp"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = '2090178d6226'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()

    # 1) FRIEND REQUEST: add nullable column, backfill, then make NOT NULL
    with op.batch_alter_table('friend_request') as batch_op:
        batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))

    bind.execute(text(
        "UPDATE friend_request SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"
    ))

    with op.batch_alter_table('friend_request') as batch_op:
        batch_op.alter_column('created_at', existing_type=sa.DateTime(), nullable=False)

    # 2) GROUP INVITE: drop old duplicate timestamp (if present), ensure created_at is NOT NULL
    #    First relax to nullable=True (in case there are NULLs), backfill, then enforce NOT NULL.
    #    (If created_at already exists, this just alters it; if not, add it first.)
    try:
        with op.batch_alter_table('group_invite') as batch_op:
            # if the column doesn't exist, this will error; if so, we add it next
            batch_op.alter_column('created_at', existing_type=sa.DateTime(), nullable=True)
    except Exception:
        with op.batch_alter_table('group_invite') as batch_op:
            batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))

    # backfill existing NULLs
    bind.execute(text(
        "UPDATE group_invite SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"
    ))

    # enforce NOT NULL
    with op.batch_alter_table('group_invite') as batch_op:
        batch_op.alter_column('created_at', existing_type=sa.DateTime(), nullable=False)

    # drop duplicate column if it exists
    try:
        with op.batch_alter_table('group_invite') as batch_op:
            batch_op.drop_column('timestamp')
    except Exception:
        pass


def downgrade():
    # best-effort downgrade: re-add timestamp (nullable), drop created_at
    try:
        with op.batch_alter_table('group_invite') as batch_op:
            batch_op.add_column(sa.Column('timestamp', sa.DateTime(), nullable=True))
    except Exception:
        pass

    with op.batch_alter_table('group_invite') as batch_op:
        batch_op.drop_column('created_at')

    with op.batch_alter_table('friend_request') as batch_op:
        batch_op.drop_column('created_at')
