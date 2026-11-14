"""Offline deployment administration. No public bootstrap endpoint."""

import argparse
import getpass
import time
from pathlib import Path
from sqlalchemy import select, delete
from alembic import command
from alembic.config import Config
from authorise.database import session_factory
from authorise.models import User, Workspace, Session, Audit
from authorise.security import passwords
from authorise.workflow import uid
from email_validator import validate_email

p = argparse.ArgumentParser()
p.add_argument("command", choices=["migrate", "create-admin", "reset-password"])
p.add_argument("--email")
p.add_argument("--name")
p.add_argument("--workspace")
a = p.parse_args()
if a.command == "migrate":
    cfg = Config(str(Path(__file__).parent / "alembic.ini"))
    command.upgrade(cfg, "head")
    raise SystemExit(0)
if not a.email:
    p.error("--email is required")
email = validate_email(a.email, check_deliverability=False).normalized.casefold()
password = getpass.getpass("New password (at least 12 characters): ")
if len(password) < 12 or len(password) > 128:
    raise SystemExit("Password must contain 12–128 characters.")
if password != getpass.getpass("Confirm password: "):
    raise SystemExit("Passwords do not match.")
with session_factory()() as db:
    user = db.scalar(select(User).where(User.email == email))
    if a.command == "create-admin":
        if user:
            raise SystemExit("An account with this email already exists.")
        if not a.name or not a.workspace:
            p.error("--name and --workspace are required")
        ws = Workspace(id=uid(), name=a.workspace)
        db.add(ws)
        db.flush()
        user = User(
            id=uid(),
            workspace_id=ws.id,
            email=email,
            name=a.name,
            password_hash=passwords.hash(password),
            role="admin",
            active=True,
        )
        db.add(user)
    else:
        if not user:
            raise SystemExit("Account not found.")
        user.password_hash = passwords.hash(password)
        db.execute(delete(Session).where(Session.user_id == user.id))
    db.add(
        Audit(
            id=uid(),
            workspace_id=user.workspace_id,
            actor_id=user.id,
            action="management." + a.command,
            target=user.id,
            at=int(time.time()),
        )
    )
    db.commit()
print("Account updated. No password was written to source or command arguments.")
