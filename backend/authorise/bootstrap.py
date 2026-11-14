"""One-time, offline administrator invitation; never a public signup route."""

import re
import time
from uuid import uuid5, NAMESPACE_URL

from email_validator import validate_email
from sqlalchemy import select
from .database import session_factory
from .models import Workspace, User, Invitation, Audit


def initialise_admin(email: str, token_hash: str) -> str:
    email = validate_email(email, check_deliverability=False).normalized.casefold()
    if not re.fullmatch(r"[0-9a-f]{64}", token_hash):
        raise ValueError("Bootstrap requires a SHA-256 token hash.")
    workspace_id = str(uuid5(NAMESPACE_URL, "vaedoc-authorise:first-workspace"))
    invitation_id = str(uuid5(NAMESPACE_URL, "vaedoc-authorise:first-admin"))
    with session_factory()() as db:
        # Never replace credentials or create a second bootstrap administrator.
        if db.scalar(select(User.id).limit(1)):
            return "Administrator setup already completed."
        invitation = db.get(Invitation, invitation_id)
        if invitation:
            if invitation.email != email or invitation.token_hash != token_hash:
                raise ValueError("An initial administrator invitation already exists.")
            return "Initial administrator invitation already exists."
        if db.scalar(select(Workspace.id).limit(1)):
            raise ValueError("Bootstrap requires a new, empty installation.")
        now = int(time.time())
        db.add(Workspace(id=workspace_id, name="Vaedoc Demonstration"))
        db.flush()
        db.add(Invitation(
            id=invitation_id, workspace_id=workspace_id, email=email,
            role="admin", token_hash=token_hash, expires_at=now + 48 * 3600,
            used_at=None, revoked=False,
        ))
        db.add(Audit(
            id=str(uuid5(NAMESPACE_URL, "vaedoc-authorise:first-admin-audit")),
            workspace_id=workspace_id, actor_id=None,
            action="management.initial-admin-invitation", target=invitation_id, at=now,
        ))
        db.commit()
    return "Initial administrator invitation created (valid for 48 hours)."
