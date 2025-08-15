from flask import Flask, request, redirect, render_template, session, url_for, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_wtf.csrf import CSRFProtect
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from openai import OpenAI
import stripe, os, re, base64, json, smtplib
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from email.message import EmailMessage
from sqlalchemy import and_
from models import db, User, FriendRequest, Transaction, Group, GroupMember, GroupInvite
from flask_migrate import Migrate



# Load environment variables
load_dotenv(os.getenv("ENV_FILE") or None, override=True)

# Keys and Configs
OPENAI_API_KEY       = (os.getenv("OPENAI_API_KEY") or "").strip()
STRIPE_SECRET_KEY    = os.getenv("STRIPE_SECRET_KEY")
STRIPE_PUBLISHABLE   = os.getenv("STRIPE_PUBLISHABLE_KEY")
endpoint_secret      = os.getenv("STRIPE_WEBHOOK_SECRET")
SECRET_KEY           = os.getenv("SECRET_KEY") or "dev-only-change-me"
DATABASE_URL         = os.getenv("SQLALCHEMY_DATABASE_URI") or "sqlite:///splitpay.db"

MAIL_SERVER         = os.getenv("MAIL_SERVER", "smtp.gmail.com")
MAIL_PORT           = int(os.getenv("MAIL_PORT") or 587)
MAIL_USE_TLS        = os.getenv("MAIL_USE_TLS", "True").strip().lower() == "true"
MAIL_USERNAME       = os.getenv("MAIL_USERNAME")
MAIL_PASSWORD       = os.getenv("MAIL_PASSWORD")
MAIL_DEFAULT_SENDER = os.getenv("MAIL_DEFAULT_SENDER") or MAIL_USERNAME

# Init APIs
client = OpenAI(api_key=OPENAI_API_KEY)
stripe.api_key = STRIPE_SECRET_KEY

# Init Flask
app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
app.config.update(
    SQLALCHEMY_DATABASE_URI=DATABASE_URL,
    SQLALCHEMY_TRACK_MODIFICATIONS=False,
    SECRET_KEY=SECRET_KEY,
    UPLOAD_FOLDER="static/profile_pics"
)

csrf = CSRFProtect(app)
db.init_app(app)
migrate = Migrate(app, db)  
with app.app_context():
    db.create_all()

migrate = Migrate(app, db)

# Allowed file extensions
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif"}
def allowed_file(fn):
    return "." in fn and fn.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

# Sessions
app.permanent_session_lifetime = timedelta(days=30)

# Token serializer for password reset
ts = URLSafeTimedSerializer(app.config["SECRET_KEY"])

# Email sending function
def send_email(to_email: str, subject: str, html: str):
    """
    Sends an HTML email using SMTP with Gmail.
    Falls back to console logging if credentials are missing.
    """

    # Check that we have credentials before trying to send
    if not (MAIL_USERNAME and MAIL_PASSWORD):
        print("\n=== EMAIL (dev fallback) ===")
        print("To:", to_email)
        print("Subject:", subject)
        print("HTML:\n", html)
        print("===========================\n")
        return

    try:
        # Create email message object
        msg = EmailMessage()
        msg["From"] = MAIL_DEFAULT_SENDER or MAIL_USERNAME
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.set_content("Your email client does not support HTML.")
        msg.add_alternative(html, subtype="html")  # HTML version

        # Connect to SMTP server
        with smtplib.SMTP(MAIL_SERVER, MAIL_PORT) as smtp:
            if MAIL_USE_TLS:
                smtp.starttls()
            smtp.login(MAIL_USERNAME, MAIL_PASSWORD)
            smtp.send_message(msg)

        print(f"Email sent successfully to {to_email}")

    except Exception as e:
        # Don’t crash the app if email fails
        print("Email send failed:", repr(e))
        print("\n=== EMAIL (fallback after failure) ===")
        print("To:", to_email)
        print("Subject:", subject)
        print("HTML:\n", html)
        print("======================================\n")


# Forgot password route
# Forgot password
@csrf.exempt
@app.route("/forgot-password", methods=["GET", "POST"])
def forgot():
    if request.method == "POST":
        email = request.form.get("email")
        user = User.query.filter_by(email=email).first()
        if user:
            token = ts.dumps(user.email, salt="password-reset-salt")
            reset_url = url_for("reset_password", token=token, _external=True)

            html = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8" />
                <style>
                body {{
                    font-family: Arial, sans-serif;
                    background-color: #f9f9f9;
                    margin: 0;
                    padding: 0;
                }}
                .container {{
                    max-width: 500px;
                    background: #fff;
                    padding: 20px;
                    margin: 40px auto;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }}
                h2 {{ color: #333; }}
                p  {{ color: #555; }}
                a.button {{
                    display: inline-block;
                    background: #019863;
                    color: #fff;
                    padding: 12px 20px;
                    text-decoration: none;
                    border-radius: 6px;
                    margin-top: 16px;
                }}
                a.button:hover {{ background: #017f53; }}
                </style>
            </head>
            <body>
                <div class="container">
                <h2>Password Reset Request</h2>
                <p>We received a request to reset your password for your SplitPay account.</p>
                <p>Click the button below to choose a new password. This link is valid for <strong>1 hour</strong>.</p>
                <p><a class="button" href="{reset_url}">Reset Password</a></p>
                <p>If you didn’t request this, you can safely ignore this email.</p>
                </div>
            </body>
            </html>
            """


            send_email(user.email, "SplitPay Password Reset", html)

            send_email(user.email, "SplitPay Password Reset", html)

        # use your existing template name
        return render_template("forgot_password_sent.html")

    # use your existing template name
    return render_template("forgot_password.html")


@csrf.exempt
@app.route("/reset/<token>", methods=["GET", "POST"])
def reset_password(token):
    try:
        email = ts.loads(token, salt="password-reset-salt", max_age=3600)
    except SignatureExpired:
        return "The token has expired", 400
    except BadSignature:
        return "Invalid token", 400

    if request.method == "POST":
        password = request.form.get("password")
        hashed_pw = generate_password_hash(password)
        user = User.query.filter_by(email=email).first()
        if user:
            user.password = hashed_pw
            db.session.commit()
            return redirect(url_for("login"))

    # use your existing template name
    return render_template("reset_password.html", token=token)




@csrf.exempt
@app.route("/")
def home():
    if "user_id" not in session:
        return render_template("landing.html")

    user = User.query.get(session["user_id"])
    transactions = (
        Transaction.query
        .filter_by(payer=user.full_name)
        .order_by(Transaction.id.desc())
        .all()
    )

    return render_template(
        "index.html",
        user_email=user.email,
        user_full_name=user.full_name,
        friends=user.friends.all(),
        user_groups=[(gm.group, len(gm.group.members)) for gm in user.group_links],
        transactions=transactions
    )

@app.route("/pricing")
def pricing():
    return render_template("pricing.html")


@csrf.exempt
@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        full_name = request.form["full_name"]
        username = request.form["username"]
        email = request.form["email"]
        password = request.form["password"]

        # Check if username or email already exists
        if User.query.filter_by(username=username).first():
            return render_template(
                "signup.html",
                error="That username is already taken. Please choose another."
            )
        if User.query.filter_by(email=email).first():
            return render_template(
                "signup.html",
                error="That email is already registered. Please log in instead."
            )

        hashed_password = generate_password_hash(password)

        new_user = User(
            full_name=full_name,
            username=username,
            email=email,
            password=hashed_password
        )
        db.session.add(new_user)
        db.session.commit()

        return redirect(url_for("login"))

    return render_template("signup.html")



@csrf.exempt
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email'].strip()
        password = request.form['password']
        remember = bool(request.form.get('remember'))

        user = User.query.filter_by(email=email).first()
        if user and check_password_hash(user.password, password):
            session.permanent = remember  # <-- key line
            session['user_id'] = user.id
            return redirect(url_for('home'))

        return render_template('login.html', error="Invalid email or password")

    return render_template('login.html')



@app.route('/logout')
def logout():
    session.pop('user_id', None)
    return redirect(url_for('home'))



@csrf.exempt
@app.route('/friends', methods=['GET', 'POST'])
def friends():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    user = User.query.get(session['user_id'])
    if not user:
        return redirect(url_for('login'))

    search_result = None
    if request.method == 'POST':
        search_username = request.form.get('search_username')
        if search_username:
            search_result = User.query.filter_by(username=search_username).first()

        to_id = request.form.get('send_request_to_id')
        if to_id:
            to_user = User.query.get(int(to_id))
            if to_user and to_user not in user.friends:
                friend_request = FriendRequest(from_user_id=user.id, to_user_id=to_user.id)
                db.session.add(friend_request)
                db.session.commit()

    pending_requests = FriendRequest.query.filter_by(to_user_id=user.id, status='pending').all()
    return render_template(
    "friends.html",
    user=user,  
    friends=user.friends.all(),
    search_result=search_result,
    pending_requests=pending_requests
)




@csrf.exempt
@app.route('/accept_request/<int:request_id>', methods=['POST'])
def accept_request(request_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))

    fr = FriendRequest.query.get(request_id)
    if fr and fr.to_user_id == session['user_id']:
        fr.status = 'accepted'
        user = User.query.get(fr.to_user_id)
        sender = User.query.get(fr.from_user_id)
        user.friends.append(sender)
        sender.friends.append(user)
        db.session.commit()

    return redirect(url_for('friends'))



# === Notifications helpers ===
def notification_count_for(user_id: int) -> int:
    if not user_id:
        return 0
    fr_count = FriendRequest.query.filter_by(to_user_id=user_id, status='pending').count()
    gi_count = GroupInvite.query.filter_by(to_user_id=user_id, status='pending').count()
    return (fr_count or 0) + (gi_count or 0)

# Make notif_count available to every Jinja template render
@app.context_processor
def inject_notif_count():
    uid = session.get('user_id')
    return {'notif_count': notification_count_for(uid)}




# === Notifications helpers (drop-in replacements) ===
def _avatar_url(filename: str | None) -> str:
    if filename:
        return url_for('static', filename=f'profile_pics/{filename}')
    return url_for('static', filename='profile_pics/default.png')

def _pending_notifications(user_id: int) -> list[dict]:
    """Return a list of normalized notification dicts the JS expects."""
    if not user_id:
        return []

    items: list[dict] = []

    # Friend requests -> type: 'friend_request'
    frs = (
        db.session.query(FriendRequest, User)
        .join(User, User.id == FriendRequest.from_user_id)
        .filter(and_(
            FriendRequest.to_user_id == user_id,
            FriendRequest.status == 'pending'
        ))
        .order_by(FriendRequest.id.desc())
        .all()
    )
    for fr, sender in frs:
        created = getattr(fr, "created_at", None)
        items.append({
            "id": fr.id,                         # numeric, matches /accept_request/<id>
            "type": "friend_request",
            "sender_name": sender.full_name or sender.username,
            "sender_pic": _avatar_url(sender.profile_pic),
            "created_at": (created.isoformat() if created else datetime.utcnow().isoformat()),
            "href": url_for('friends'),
        })

    # Group invites -> type: 'group_invite'
    gis = (
        db.session.query(GroupInvite, Group, User)
        .join(Group, Group.id == GroupInvite.group_id)
        .join(User, User.id == GroupInvite.from_user_id)
        .filter(and_(
            GroupInvite.to_user_id == user_id,
            GroupInvite.status == 'pending'
        ))
        .order_by(GroupInvite.id.desc())
        .all()
    )
    for gi, group, inviter in gis:
        created = getattr(gi, "created_at", None)
        items.append({
            "invite_id": gi.id,                  # what script.js sends to accept/decline
            "type": "group_invite",
            "group_name": group.name,
            "inviter_name": inviter.full_name or inviter.username,
            "inviter_pic": _avatar_url(inviter.profile_pic),
            "created_at": (created.isoformat() if created else datetime.utcnow().isoformat()),
            "href": url_for('my_invites'),
        })

    # newest first
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items

@csrf.exempt
@app.route('/notifications/count')
def notifications_count():
    """Lightweight count for the red badge."""
    if 'user_id' not in session:
        return jsonify({"count": 0})
    # Count pending items from both sources
    fr_count = FriendRequest.query.filter_by(
        to_user_id=session['user_id'], status='pending'
    ).count()
    gi_count = GroupInvite.query.filter_by(
        to_user_id=session['user_id'], status='pending'
    ).count()
    return jsonify({"count": (fr_count or 0) + (gi_count or 0)})

@csrf.exempt
@app.route('/notifications/list')
def notifications_list():
    """Full list so the dropdown can render details + buttons."""
    if 'user_id' not in session:
        return jsonify([]), 401

    items = _pending_notifications(session['user_id'])

    # add unread flag using a simple session timestamp
    seen_iso = session.get('_notif_seen_at')
    if seen_iso:
        try:
            seen = datetime.fromisoformat(seen_iso)
            for it in items:
                it['unread'] = datetime.fromisoformat(it["created_at"]) > seen
        except Exception:
            for it in items:
                it['unread'] = True
    else:
        for it in items:
            it['unread'] = True

    return jsonify(items), 200

# Support BOTH dash and underscore for mark-read, to be safe.
@csrf.exempt
@app.route('/notifications/mark-read', methods=['POST'])
@app.route('/notifications/mark_read', methods=['POST'])
def notifications_mark_read():
    if 'user_id' not in session:
        return jsonify({"ok": False}), 401
    session['_notif_seen_at'] = datetime.utcnow().isoformat()
    return jsonify({"ok": True})










@csrf.exempt
@app.route('/friend_request/accept/<int:request_id>', methods=['POST'])
def accept_friend_request(request_id):
    # Accept logic
    return jsonify({"ok": True})

@csrf.exempt
@app.route('/friend_request/decline/<int:request_id>', methods=['POST'])
def decline_friend_request(request_id):
    # Decline logic
    return jsonify({"ok": True})



@csrf.exempt
@app.route('/profile', methods=['GET', 'POST'])
def profile():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    db.session.expire_all()
    user = db.session.get(User, session['user_id'])

    if request.method == 'POST':
        if 'profile_pic' in request.files:
            file = request.files['profile_pic']
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(filepath)
                user.profile_pic = filename
                db.session.commit()

    transactions = (
        Transaction.query
        .filter_by(payer=user.full_name)
        .order_by(Transaction.date.desc())
        .all()
    )

    return render_template("profile.html", user=user, transactions=transactions)




@csrf.exempt
@app.route("/remove_photo", methods=["POST"])
def remove_photo():
    if 'user_id' not in session:
        return redirect(url_for("login"))

    user = User.query.get(session["user_id"])
    if user:
        user.profile_pic = None
        db.session.commit()

    return redirect(url_for("profile"))




@app.route("/calculate", methods=["POST"])
@csrf.exempt
def calculate_split():
    try:
        data = request.get_json()
        paid_by = data.get("paid_by")
        items = data.get("items", [])
        name_lookup = data.get("name_lookup", {})

        if not paid_by or not items:
            return jsonify({"error": "Missing paid_by or items"}), 400

        balances = {}
        for item in items:
            owners = item.get("owners", [])
            price = float(item.get("price", 0))
            if not owners or price <= 0:
                continue
            split_amount = round(price / len(owners), 2)
            for owner in owners:
                if owner == paid_by:
                    continue
                balances[owner] = balances.get(owner, 0) + split_amount
            balances[paid_by] = balances.get(paid_by, 0) - split_amount * len([o for o in owners if o != paid_by])

        for person in balances:
            balances[person] = round(balances[person], 2)

        user_id = session.get("user_id")
        if user_id:
            user = User.query.get(user_id)
            if paid_by == user.email:
                total_owed_to_user = sum(
                    amount for email, amount in balances.items() if email != user.email and amount > 0
                )
                if total_owed_to_user > 0:
                    transaction = Transaction(
                        payer=user.full_name,
                        amount=total_owed_to_user,
                        date=datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                    )
                    db.session.add(transaction)
                    db.session.commit()

        return jsonify({"reimbursements": balances})

    except Exception as e:
        return jsonify({"error": str(e), "reimbursements": {}})






@app.route("/save_transaction", methods=["POST"])
@csrf.exempt
def save_transaction():
    data = request.get_json()
    payer = data.get("payer")
    amount = data.get("amount")
    description = data.get("description")
    date = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    print("Saving transaction with payer:", payer)

    new_txn = Transaction(payer=payer, amount=amount, description=description, date=date)
    db.session.add(new_txn)
    db.session.commit()

    return jsonify({"status": "success"})





@app.route("/group/<int:group_id>")
def get_group(group_id):
    group = Group.query.get(group_id)
    if not group:
        return jsonify({"error": "Group not found"}), 404

    members = [{
        "full_name": member.user.full_name
    } for member in group.members]

    return jsonify({
        "name": group.name,
        "members": members
    })







@csrf.exempt
@app.route('/billing', methods=['GET', 'POST'])
def billing():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    user = User.query.get(session['user_id'])

    if request.method == 'POST':
        selected_plan = request.form.get('plan')

        normalized_plan = selected_plan.split('_')[0] if selected_plan else None

        if normalized_plan in ['free', 'pro', 'pro_plus']:
            user.subscription_tier = normalized_plan
            db.session.commit()
            return redirect(url_for('profile'))

    return render_template('billing.html', user=user)





@csrf.exempt
@app.route('/confirm_transaction', methods=['POST'])
def confirm_transaction():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    data = request.get_json()
    paid_by = data["paid_by"]
    items = data["items"]

    user = User.query.get(session['user_id'])

    total_amount = sum(
        item.get("price", 0) for item in items
        if isinstance(item.get("price"), (int, float))
    )

    description_lines = []
    for item in items:
        name = item.get("name")
        price = float(item.get("price", 0))
        owners = ", ".join(item.get("owners", []))
        description_lines.append(f"{name} (${price:.2f}) split between: {owners}")
    description = "\n".join(description_lines)

    transaction = Transaction(
        payer=user.full_name,  
        amount=round(total_amount, 2),
        date=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        description=description
    )
    db.session.add(transaction)
    db.session.commit()

    return jsonify({
        "message": "Transaction saved successfully!",
        "payer": user.full_name,
        "amount": round(total_amount, 2),
        "date": transaction.date
    })






@csrf.exempt
@app.route('/create-checkout-session', methods=['POST'])
def create_checkout_session():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    user = User.query.get(session['user_id'])
    data = request.get_json(silent=True) or {}
    selected_plan = data.get('plan') or request.form.get('plan')

    # Pull live (or test) price IDs from env so you never hard-code them
    price_lookup = {
        'pro': os.getenv('STRIPE_PRICE_PRO'),
        'pro_plus': os.getenv('STRIPE_PRICE_PRO_PLUS'),
    }
    price_id = price_lookup.get(selected_plan)
    if not price_id:
        return jsonify({"error": f"Invalid plan '{selected_plan}'. Check STRIPE_PRICE_* env vars."}), 400

    try:
        if not user.stripe_customer_id:
            customer = stripe.Customer.create(email=user.email)
            user.stripe_customer_id = customer.id
            db.session.commit()
        else:
            customer = stripe.Customer.retrieve(user.stripe_customer_id)
    except stripe.error.StripeError as e:
        return jsonify({"error": f"Stripe customer error: {str(e)}"}), 400

    try:
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[{'price': price_id, 'quantity': 1}],
            mode='subscription',
            customer=customer.id,
            success_url=url_for('payment_success', _external=True) + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=url_for('billing', _external=True),
            metadata={'user_id': str(user.id)}
        )
        return jsonify({"url": checkout_session.url})
    except stripe.error.StripeError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "Unexpected error creating checkout session"}), 500




@csrf.exempt
@app.route('/set-plan', methods=['POST'])
def set_plan():
    if 'user_id' not in session:
        return jsonify({"ok": False, "error": "Not logged in"}), 401
    data = request.get_json(silent=True) or {}
    if data.get('plan') != 'free':
        return jsonify({"ok": False, "error": "Invalid plan"}), 400
    user = User.query.get(session['user_id'])
    user.subscription_tier = 'free'
    db.session.commit()
    return jsonify({"ok": True})




@csrf.exempt
@app.route('/payment_success')
def payment_success():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    session_id = request.args.get('session_id')
    if not session_id:
        return render_template('payment_success.html')

    try:
        sess = stripe.checkout.Session.retrieve(
            session_id,
            expand=["subscription", "customer"]
        )

        stripe_customer_id = sess.customer
        user = User.query.get(session['user_id'])
        if user and not user.stripe_customer_id:
            user.stripe_customer_id = stripe_customer_id

        sub = sess.subscription
        if isinstance(sub, str):
            sub = stripe.Subscription.retrieve(sub, expand=["items.data.price"])
        price_id = sub["items"]["data"][0]["price"]["id"]

        PRICE_TO_TIER = {
            os.getenv('STRIPE_PRICE_PRO'): 'pro',
            os.getenv('STRIPE_PRICE_PRO_PLUS'): 'pro_plus',
        }

        if user:
            new_tier = PRICE_TO_TIER.get(price_id)
            if new_tier:
                user.subscription_tier = new_tier
                db.session.commit()
    except Exception as e:
        print("payment_success confirm error:", e)

    return render_template('payment_success.html')



@csrf.exempt
@app.route("/webhook", methods=["POST"])
def stripe_webhook():
    # Raw payload + signature
    payload = request.data
    sig_header = request.headers.get("Stripe-Signature") or request.headers.get("stripe-signature")
    if not sig_header:
        return jsonify(success=False, error="Missing Stripe-Signature"), 400

    # Verify signature
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
        print("✅ Event verified:", event["type"])
    except (ValueError, stripe.error.SignatureVerificationError) as e:
        print("❌ Webhook verification failed:", e)
        return jsonify(success=False), 400

    # Map price -> tier from ENV (works in Test or Live depending on your keys)
    PRICE_TO_TIER = {
        os.getenv("STRIPE_PRICE_PRO"): "pro",
        os.getenv("STRIPE_PRICE_PRO_PLUS"): "pro_plus",
    }

    try:
        etype = event["type"]

        # 1) Checkout completed: set tier based on the subscription's price
        if etype == "checkout.session.completed":
            obj = event["data"]["object"]
            stripe_customer_id = obj.get("customer")
            user_id = (obj.get("metadata") or {}).get("user_id")

            # Prefer the subscription on the session (more accurate than listing)
            sub_id = obj.get("subscription")
            if isinstance(sub_id, str):
                sub = stripe.Subscription.retrieve(sub_id, expand=["items.data.price"])
            else:
                # Fallback: list latest active subscription for the customer
                subs = stripe.Subscription.list(customer=stripe_customer_id, status="all", limit=1)
                sub = subs.data[0] if subs.data else None

            price_id = None
            if sub and sub.get("items", {}).get("data"):
                price_id = sub["items"]["data"][0]["price"]["id"]

            user = None
            if user_id:
                try:
                    user = User.query.get(int(user_id))
                except Exception:
                    user = None

            if not user and stripe_customer_id:
                user = User.query.filter_by(stripe_customer_id=stripe_customer_id).first()

            if user:
                if stripe_customer_id and not user.stripe_customer_id:
                    user.stripe_customer_id = stripe_customer_id
                user.subscription_tier = PRICE_TO_TIER.get(price_id, "free")
                db.session.commit()
                print(f"✅ {user.email} set to {user.subscription_tier} via checkout.session.completed")

        elif etype == "customer.subscription.updated":
            sub = event["data"]["object"]
            stripe_customer_id = sub.get("customer")
            user = User.query.filter_by(stripe_customer_id=stripe_customer_id).first()
            if user and sub.get("items", {}).get("data"):
                price_id = sub["items"]["data"][0]["price"]["id"]
                user.subscription_tier = PRICE_TO_TIER.get(price_id, "free")
                db.session.commit()
                print(f"🔄 {user.email} updated to {user.subscription_tier}")

        elif etype == "customer.subscription.deleted":
            sub = event["data"]["object"]
            stripe_customer_id = sub.get("customer")
            user = User.query.filter_by(stripe_customer_id=stripe_customer_id).first()
            if user:
                user.subscription_tier = "free"
                db.session.commit()
                print(f"⤵️ {user.email} downgraded to free (subscription canceled)")

    except Exception as e:
        print("Webhook handler error:", e)

    return jsonify(success=True), 200


@csrf.exempt
@app.route("/get_group_members/<int:group_id>")
def get_group_members(group_id):
    members = (
        db.session.query(User)
        .join(GroupMember, GroupMember.user_id == User.id)
        .filter(GroupMember.group_id == group_id)
        .all()
    )

    return jsonify([
        {"email": m.email, "full_name": m.full_name}
        for m in members
    ])



@csrf.exempt
@app.route("/group_details", methods=["POST"])
def group_details():
    user_id = session.get("user_id")
    data = request.get_json()
    group_name = data.get("group")
    
    group = Group.query.filter_by(name=group_name).first()
    if not group:
        return jsonify({"error": "Group not found"}), 404

    is_member = GroupMember.query.filter_by(group_id=group.id, user_id=user_id).first()
    if not is_member:
        return jsonify({"error": "Not a member of this group"}), 403

    members = GroupMember.query.filter_by(group_id=group.id).all()
 
    member_data = []
    for m in members:
        user = User.query.get(m.user_id)
        member_data.append({
            "name": getattr(user, "name", None),
            "email": user.email
    })

    is_creator = group.creator_id == user_id

    return jsonify({
        "group": group.name,
        "members": member_data,
        "is_creator": is_creator
    })







@app.route('/create_group', methods=['POST'])
@csrf.exempt  
def create_group():
    data = request.get_json()
    group_name = data.get("name")
    user_id = session.get("user_id")

    if not group_name or not user_id:
        return jsonify({"error": "Missing data"}), 400

    group = Group(name=group_name, creator_id=user_id)
    db.session.add(group)
    db.session.commit()

    member = GroupMember(group_id=group.id, user_id=user_id)
    db.session.add(member)
    db.session.commit()

    return jsonify({"success": True, "group_id": group.id})




@csrf.exempt
@app.route("/leave_group", methods=["POST"])
def leave_group():
    data = request.get_json()
    group_id = data.get("group_id")
    user_id = session.get("user_id")

    if not group_id or not user_id:
        return jsonify({"error": "Missing data"}), 400

    GroupMember.query.filter_by(group_id=group_id, user_id=user_id).delete()
    db.session.commit()
    return jsonify({"message": "You left the group."})



@app.route('/delete_group', methods=['POST'])
@csrf.exempt
def delete_group():
    data = request.get_json()
    group_name = data.get("group")

    group = Group.query.filter_by(name=group_name).first()
    if not group:
        return jsonify({"error": "Group not found"}), 404

    if group.creator_id != session.get("user_id"):
        return jsonify({"error": "Unauthorized"}), 403

    GroupMember.query.filter_by(group_id=group.id).delete()
    db.session.delete(group)
    db.session.commit()

    return jsonify({"success": True})



@csrf.exempt
@app.route('/pending_group_invites')
def pending_group_invites():
    if 'user_id' not in session:
        return jsonify([])

    user_id = session['user_id']
    invites = (
        db.session.query(GroupInvite, Group.name, User.username)
        .join(Group, Group.id == GroupInvite.group_id)
        .join(User, User.id == GroupInvite.from_user_id)   
        .filter(GroupInvite.to_user_id == user_id)          
        .all()
    )
    results = [{
        "invite_id": inv.id,
        "group_name": group_name,
        "invited_by": inviter_username
    } for inv, group_name, inviter_username in invites]
    return jsonify(results)




@csrf.exempt
@app.route('/accept_group_invite', methods=['POST'])
def accept_group_invite():
    if 'user_id' not in session:
        return jsonify({"success": False}), 401

    data = request.get_json()
    invite_id = data.get("invite_id")

    invite = GroupInvite.query.get(invite_id)
    if not invite or invite.to_user_id != session['user_id']:
        return jsonify({"success": False}), 403

    # Prevent double-adding members
    exists = GroupMember.query.filter_by(user_id=invite.to_user_id, group_id=invite.group_id).first()
    if not exists:
        member = GroupMember(user_id=invite.to_user_id, group_id=invite.group_id)
        db.session.add(member)

    db.session.delete(invite)
    db.session.commit()


    return jsonify({"success": True})




@csrf.exempt
@app.route('/invite_to_group', methods=['POST'])
def invite_to_group():
    if 'user_id' not in session:
        return jsonify({"success": False, "error": "Not logged in"}), 403

    data = request.get_json()
    group_name = data.get("group")
    invitee_username = data.get("invitee")

    if not group_name or not invitee_username:
        return jsonify({"success": False, "error": "Missing data"}), 400

    group = Group.query.filter_by(name=group_name).first()
    inviter_id = session["user_id"]
    invitee = User.query.filter_by(username=invitee_username).first()

    if not group or not invitee:
        return jsonify({"success": False, "error": "Group or user not found"}), 404

    existing_member = GroupMember.query.filter_by(group_id=group.id, user_id=invitee.id).first()
    if existing_member:
        return jsonify({"success": False, "error": "User is already a group member"}), 400

    existing_invite = GroupInvite.query.filter_by(group_id=group.id, to_user_id=invitee.id, status='pending').first()
    if existing_invite:
        return jsonify({"success": False, "error": "User already invited"}), 400

    invite = GroupInvite(
        group_id=group.id,
        from_user_id=inviter_id,
        to_user_id=invitee.id,
        status='pending'
    )
    db.session.add(invite)
    db.session.commit()

    return jsonify({"success": True, "message": f"Invite sent to {invitee.username}!"})



@csrf.exempt
@app.route('/my_invites')
def my_invites():
    if 'user_id' not in session:
        return redirect('/login')

    user = User.query.get(session['user_id'])

    rows = (
        db.session.query(GroupInvite, Group.name, User.full_name)
        .join(Group, Group.id == GroupInvite.group_id)
        .join(User, User.id == GroupInvite.from_user_id)   
        .filter(GroupInvite.to_user_id == user.id)
        .all()
    )

    invites = [
        {
            "id": gi.id,
            "group_name": group_name,
            "invited_by": inviter_name,
            "status": gi.status,
            "created_at": gi.created_at,
        }
        for gi, group_name, inviter_name in rows
    ]

    return render_template("my_invites.html", user=user, invites=invites)





@csrf.exempt
@app.route('/decline_invite', methods=['POST'])
def decline_invite():
    invite_id = request.form.get("invite_id")
    invite = GroupInvite.query.get(invite_id)

    if invite and invite.to_user_id == session.get("user_id"):
        db.session.delete(invite)
        db.session.commit()

    return redirect("/my_invites")




@csrf.exempt
@app.route('/upload_receipt', methods=['POST'])
def upload_receipt():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    user = User.query.get(session['user_id'])

    now = datetime.now(timezone.utc)
    if user.scan_reset_date is None or now.month != user.scan_reset_date.month or now.year != user.scan_reset_date.year:
        user.scan_count = 0
        user.scan_reset_date = now
        db.session.commit()

    if user.subscription_tier == 'free':
        return {"error": "AI receipt uploads are only available on Pro and Pro+ plans."}, 403

    if user.subscription_tier == 'pro' and user.scan_count >= 100:
        return {"error": "You have reached your monthly limit of 100 AI receipt scans."}, 403

    if 'receipt' not in request.files:
        return {"error": "No file uploaded"}, 400

    file = request.files['receipt']
    if file.filename == '':
        return {"error": "Empty filename"}, 400

    image_bytes = file.read()
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert receipt parser. Extract all line items with names and prices from this receipt. "
                        "Include tax if it's listed as a separate line item. DO NOT include totals, subtotals, change, payment methods, or tips. "
                        "Format the response as a JSON list like: [{\"name\": \"item\", \"price\": 1.23}]. "
                        "If tax is present, include it as an item named 'Tax' at the end of the list."
                    )
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}"
                            },
                        }
                    ],
                }
            ],
            max_tokens=1000
        )
    except Exception as e:
        print("OpenAI API error:", repr(e))
        return {"error": "AI parsing failed. Check your API key or try again later."}, 500

    user.scan_count += 1
    db.session.commit()

    group_id = request.form.get('group_id')
    if group_id:
        members = (
            db.session.query(User)
            .join(GroupMember)
            .filter(GroupMember.group_id == group_id)
            .all()
        )
        friends = [{"email": m.email, "full_name": m.full_name or m.username} for m in members if m.id != user.id]
    else:
        friends = [{"email": f.email, "full_name": f.full_name or f.username} for f in user.friends]

    reply = response.choices[0].message.content.strip()
    print("🧾 AI raw reply:", reply)

    match = re.search(r"```json\s*(.*?)\s*```", reply, re.DOTALL)
    cleaned = match.group(1) if match else reply

    try:
        items = json.loads(cleaned)
    except Exception as e:
        print("Failed to parse AI response:", e)
        print("Raw content received:", cleaned)
        return {"error": "Could not parse items from receipt."}, 400

    if not items:
        return {"error": "No items found in receipt"}, 400

    owners_set = set()
    for item in items:
        if item.get("name", "").lower() != "tax":
            owners_set.update(item.get("owners", []))
    for item in items:
        if item.get("name", "").lower() == "tax":
            item["owners"] = list(owners_set)

    total_amount = sum(item["price"] for item in items)

    return {
        "items": items,
        "user": {
            "email": user.email,
            "full_name": user.full_name or user.username
        },
        "friends": friends,
        "total_amount": total_amount
    }



if __name__ == "__main__":
    app.run(debug=False)

