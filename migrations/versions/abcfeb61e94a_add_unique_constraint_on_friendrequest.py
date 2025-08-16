from alembic import op
import sqlalchemy as sa

revision = "abcfeb61e94a"
down_revision = "c8d6bb8635be"   # keep whatever you already have
branch_labels = None
depends_on = None

def upgrade():
    # 1) de-dupe existing rows so the unique index can be created
    op.execute("""
        DELETE FROM friend_request
        WHERE rowid NOT IN (
            SELECT MIN(rowid)
            FROM friend_request
            GROUP BY from_user_id, to_user_id
        );
    """)

    op.create_index(
        "uq_friend_requests_pair",
        "friend_request",
        ["from_user_id", "to_user_id"],
        unique=True,
    )

def downgrade():
    op.drop_index("uq_friend_requests_pair", table_name="friend_request")
