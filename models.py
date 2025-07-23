from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# Association table for friendships (many-to-many)
friendships = db.Table('friendships',
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
    friends = db.relationship(
        'User',
        secondary=friendships,
        primaryjoin=(friendships.c.user_id == id),
        secondaryjoin=(friendships.c.friend_id == id),
        backref=db.backref('friends_back', lazy='dynamic'),
        lazy='dynamic'
    )

class FriendRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    from_user_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    to_user_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    status = db.Column(db.String(20), default="pending")

    from_user = db.relationship("User", foreign_keys=[from_user_id], backref="sent_requests")
    to_user = db.relationship("User", foreign_keys=[to_user_id], backref="received_requests")
    
    
class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    payer = db.Column(db.String(120))  # Email of the payer
    amount = db.Column(db.Float)
    date = db.Column(db.String(100))  # Store as string for simplicity
    description = db.Column(db.Text)  # New field to store itemized details
