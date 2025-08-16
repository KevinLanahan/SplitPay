from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Enum
from datetime import datetime, timezone
from itsdangerous import URLSafeTimedSerializer

db = SQLAlchemy()


friendships = db.Table(
    'friendships',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id')),
    db.Column('friend_id', db.Integer, db.ForeignKey('user.id'))
)




class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(100))
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    profile_pic = db.Column(db.String(100), default='default.jpg')
    subscription_tier = db.Column(db.String(10), default='free')
    scan_count = db.Column(db.Integer, default=0)
    scan_reset_date = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    stripe_customer_id = db.Column(db.String, nullable=True)
    reset_token = db.Column(db.String(100), nullable=True)
    reset_token_expires = db.Column(db.DateTime, nullable=True)

    friends = db.relationship(
        'User',
        secondary=friendships,
        primaryjoin=(friendships.c.user_id == id),
        secondaryjoin=(friendships.c.friend_id == id),
        backref=db.backref('friends_back', lazy='dynamic'),
        lazy='dynamic'
    )

class FriendRequest(db.Model):
    __tablename__ = 'friend_request'
    id = db.Column(db.Integer, primary_key=True)
    from_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    to_user_id   = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    status       = db.Column(db.String(20), nullable=False, default='pending')
    created_at   = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('from_user_id', 'to_user_id', name='uq_friend_request_pair'),
    )


class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    payer = db.Column(db.String(120))
    amount = db.Column(db.Float)
    date = db.Column(db.String(100))  
    description = db.Column(db.Text)

class Group(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    creator_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    created_by = db.Column(db.String, db.ForeignKey("user.email"))
    invites = db.relationship('GroupInvite', backref='group', cascade='all, delete-orphan')
    members = db.relationship('GroupMember', backref='group', cascade='all, delete-orphan', passive_deletes=True)

class GroupMember(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref='group_links')

class GroupInvite(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id', ondelete='CASCADE'), nullable=False)
    from_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    to_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    status = db.Column(db.String(20), default="pending")

    from_user = db.relationship("User", foreign_keys=[from_user_id])
    to_user = db.relationship("User", foreign_keys=[to_user_id])

class Notification(db.Model):
    """
    Stores notifications for users.
    """
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    message = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    is_read = db.Column(db.Boolean, default=False)

    user = db.relationship("User", backref="notifications")
