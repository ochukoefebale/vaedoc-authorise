import hashlib
import hmac
import os
import secrets
import time
from urllib.parse import urlsplit
from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession
from .database import get_db
from .models import Session, User, Throttle

passwords = PasswordHash.recommended()
DUMMY = passwords.hash(secrets.token_urlsafe(24))


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def secure_cookie():
    return os.environ.get("ENVIRONMENT", "production") == "production"


def cookie_name():
    return "__Host-authorise_session" if secure_cookie() else "authorise_session"


def app_url():
    value = os.getenv("APP_URL", "").rstrip("/")
    u = urlsplit(value)
    if (
        u.scheme not in ("http", "https")
        or not u.netloc
        or u.path
        or u.query
        or u.fragment
    ):
        raise RuntimeError(
            "APP_URL must be an origin such as https://authorise.vaedoc.com"
        )
    if secure_cookie() and u.scheme != "https":
        raise RuntimeError("APP_URL requires HTTPS in production.")
    return value


def check_origin(request: Request):
    if request.headers.get("origin") != app_url():
        raise HTTPException(403, "Request origin is not permitted.")


def current_user(request: Request, db: DBSession = Depends(get_db)):
    token = request.cookies.get(cookie_name(), "")
    row = db.get(Session, digest(token)) if token else None
    user = (
        db.get(User, row.user_id) if row and row.expires_at > int(time.time()) else None
    )
    if not user or not user.active:
        raise HTTPException(401, "Sign in to your staff account.")
    request.state.auth_session = row
    return user


def csrf_user(request: Request, user: User = Depends(current_user)):
    check_origin(request)
    csrf = request.headers.get("x-csrf-token", "")
    if not hmac.compare_digest(csrf, request.state.auth_session.csrf):
        raise HTTPException(403, "Session verification failed. Refresh and retry.")
    return user


def writer(user: User = Depends(csrf_user)):
    if user.role not in ("admin", "officer"):
        raise HTTPException(403, "This account has read-only access.")
    return user


def admin(request: Request, user: User = Depends(writer)):
    if user.role != "admin":
        raise HTTPException(403, "Administrator access required.")
    return user


def throttle(db, key, limit=10):
    """Database-backed fixed window; atomic increments work across serverless instances."""
    now = int(time.time())
    key = digest(key)
    row = db.get(Throttle, key)
    if not row:
        try:
            db.add(Throttle(key=key, count=0, window_start=now))
            db.commit()
        except IntegrityError:
            db.rollback()
    db.execute(
        update(Throttle)
        .where(Throttle.key == key, Throttle.window_start <= now - 900)
        .values(count=0, window_start=now)
    )
    db.execute(
        update(Throttle).where(Throttle.key == key).values(count=Throttle.count + 1)
    )
    db.commit()
    db.expire_all()
    row = db.get(Throttle, key)
    if row.count > limit:
        raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
