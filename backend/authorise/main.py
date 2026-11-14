import json
import secrets
import time
from fastapi import FastAPI, Depends, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from sqlalchemy import select, update, delete, func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session as DBSession
from .database import get_db
from .models import User, Workspace, Session, Invitation, RequestRecord, Audit
from .security import (
    current_user,
    csrf_user,
    writer,
    admin,
    check_origin,
    app_url,
    passwords,
    DUMMY,
    digest,
    cookie_name,
    secure_cookie,
    throttle,
)
from .workflow import (
    EncounterInput,
    WorkflowError,
    intake,
    fingerprint,
    seeds,
    transition,
    uid,
)

app = FastAPI(
    title="Vaedoc Authorise",
    version="0.2.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.middleware("http")
async def protect(request, call_next):
    try:
        length = int(request.headers.get("content-length", "0") or 0)
    except ValueError:
        return JSONResponse({"error": "Invalid content length."}, status_code=400)
    if length > 120000:
        return JSONResponse({"error": "Payload too large."}, status_code=413)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.exception_handler(HTTPException)
async def http_error(request, e):
    return JSONResponse({"error": e.detail}, status_code=e.status_code)


@app.exception_handler(WorkflowError)
async def workflow_error(request, e):
    return JSONResponse({"error": str(e)}, status_code=e.status)


@app.exception_handler(SQLAlchemyError)
async def database_error(request, e):
    return JSONResponse(
        {"error": "Database unavailable. Please retry or contact your administrator."},
        status_code=503,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request, e):
    return JSONResponse(
        {"error": "Check the required fields and their permitted lengths."},
        status_code=422,
    )


class Login(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class InviteInput(BaseModel):
    email: EmailStr
    role: str = "officer"


class AcceptInvite(BaseModel):
    token: str = Field(min_length=32, max_length=200)
    email: EmailStr
    name: str = Field(min_length=2, max_length=150)
    password: str = Field(min_length=12, max_length=128)


class UserChange(BaseModel):
    active: bool


def audit(db, user, action, target, workspace=None):
    db.add(
        Audit(
            id=uid(),
            workspace_id=workspace or user.workspace_id,
            actor_id=user.id if user else None,
            action=action,
            target=target,
            at=int(time.time()),
        )
    )


def profile(user, db):
    ws = db.get(Workspace, user.workspace_id)
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "workspace": ws.name,
        "workspace_id": user.workspace_id,
        "active": user.active,
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": "synthetic-demo", "version": "0.2.0"}


@app.get("/api/auth/me")
def me(
    request: Request,
    user: User = Depends(current_user),
    db: DBSession = Depends(get_db),
):
    return {"user": profile(user, db), "csrf_token": request.state.auth_session.csrf}


@app.post("/api/auth/login")
def login(
    p: Login, request: Request, response: Response, db: DBSession = Depends(get_db)
):
    check_origin(request)
    email = str(p.email).casefold()
    throttle(db, "login:" + email)
    user = db.scalar(select(User).where(User.email == email))
    valid = passwords.verify(p.password, user.password_hash if user else DUMMY)
    if not user or not valid or not user.active:
        raise HTTPException(401, "Email or password is incorrect.")
    token = secrets.token_urlsafe(48)
    csrf = secrets.token_urlsafe(32)
    db.add(
        Session(
            token_hash=digest(token),
            user_id=user.id,
            csrf=csrf,
            expires_at=int(time.time()) + 43200,
        )
    )
    audit(db, user, "auth.login", user.id)
    db.commit()
    response.set_cookie(
        cookie_name(),
        token,
        max_age=43200,
        secure=secure_cookie(),
        httponly=True,
        samesite="lax",
        path="/",
    )
    return {"user": profile(user, db), "csrf_token": csrf}


@app.post("/api/auth/logout")
def logout(
    request: Request,
    response: Response,
    user: User = Depends(csrf_user),
    db: DBSession = Depends(get_db),
):
    db.delete(request.state.auth_session)
    audit(db, user, "auth.logout", user.id)
    db.commit()
    response.delete_cookie(
        cookie_name(), path="/", secure=secure_cookie(), httponly=True, samesite="lax"
    )
    return {"ok": True}


@app.post("/api/auth/accept-invite")
def accept(p: AcceptInvite, request: Request, db: DBSession = Depends(get_db)):
    check_origin(request)
    email = str(p.email).casefold()
    throttle(db, "invite:" + email)
    inv = db.scalar(
        select(Invitation).where(
            Invitation.token_hash == digest(p.token), Invitation.email == email
        )
    )
    now = int(time.time())
    if not inv or inv.revoked or inv.used_at is not None or inv.expires_at <= now:
        raise HTTPException(
            400, "Invitation is invalid, expired, revoked, or already used."
        )
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "An account already exists. Sign in instead.")
    hashed = passwords.hash(p.password)
    claimed = db.execute(
        update(Invitation)
        .where(
            Invitation.id == inv.id,
            Invitation.used_at.is_(None),
            Invitation.revoked.is_(False),
            Invitation.expires_at > now,
        )
        .values(used_at=now)
    )
    if claimed.rowcount != 1:
        raise HTTPException(409, "Invitation has already been used or revoked.")
    user = User(
        id=uid(),
        workspace_id=inv.workspace_id,
        email=email,
        name=p.name.strip(),
        password_hash=hashed,
        role=inv.role,
        active=True,
    )
    db.add(user)
    audit(db, user, "staff.invitation_accepted", inv.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account already exists.")
    return {"ok": True}


@app.get("/api/staff")
def staff(user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    if user.role != "admin":
        raise HTTPException(403, "Administrator access required.")
    users = db.scalars(select(User).where(User.workspace_id == user.workspace_id)).all()
    invitations = db.scalars(
        select(Invitation)
        .where(Invitation.workspace_id == user.workspace_id)
        .order_by(Invitation.expires_at.desc())
    ).all()
    return {
        "users": [profile(u, db) for u in users],
        "invitations": [
            {
                "id": i.id,
                "email": i.email,
                "role": i.role,
                "expires_at": i.expires_at,
                "status": "revoked"
                if i.revoked
                else "used"
                if i.used_at
                else "expired"
                if i.expires_at < int(time.time())
                else "pending",
            }
            for i in invitations
        ],
    }


@app.post("/api/staff/invitations")
def invite(
    p: InviteInput, user: User = Depends(admin), db: DBSession = Depends(get_db)
):
    if p.role not in ("officer", "viewer"):
        raise HTTPException(400, "Invite a managed care officer or viewer.")
    email = str(p.email).casefold()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "An account already exists.")
    db.execute(
        update(Invitation)
        .where(
            Invitation.workspace_id == user.workspace_id,
            Invitation.email == email,
            Invitation.used_at.is_(None),
        )
        .values(revoked=True)
    )
    token = secrets.token_urlsafe(48)
    id = uid()
    db.add(
        Invitation(
            id=id,
            workspace_id=user.workspace_id,
            email=email,
            role=p.role,
            token_hash=digest(token),
            expires_at=int(time.time()) + 172800,
            revoked=False,
        )
    )
    audit(db, user, "staff.invitation_created", id)
    db.commit()
    return {
        "id": id,
        "url": app_url() + "/accept-invite#token=" + token,
        "expires_in_hours": 48,
        "email_sent": False,
    }


@app.post("/api/staff/invitations/{id}/revoke")
def revoke(id: str, user: User = Depends(admin), db: DBSession = Depends(get_db)):
    row = db.scalar(
        select(Invitation).where(
            Invitation.id == id, Invitation.workspace_id == user.workspace_id
        )
    )
    if not row:
        raise HTTPException(404, "Invitation not found.")
    row.revoked = True
    audit(db, user, "staff.invitation_revoked", id)
    db.commit()
    return {"ok": True}


@app.post("/api/staff/{id}")
def change_user(
    id: str, p: UserChange, user: User = Depends(admin), db: DBSession = Depends(get_db)
):
    target = db.scalar(
        select(User).where(User.id == id, User.workspace_id == user.workspace_id)
    )
    if not target:
        raise HTTPException(404, "Staff account not found.")
    if target.id == user.id or target.role == "admin":
        raise HTTPException(
            400, "Administrator account changes require the management command."
        )
    target.active = p.active
    if not p.active:
        db.execute(delete(Session).where(Session.user_id == target.id))
    audit(db, user, "staff.activated" if p.active else "staff.deactivated", id)
    db.commit()
    return {"ok": True}


@app.get("/api/requests")
def list_requests(user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    rows = db.scalars(
        select(RequestRecord)
        .where(RequestRecord.workspace_id == user.workspace_id)
        .order_by(RequestRecord.created_at.desc())
    ).all()
    return {"requests": [json.loads(r.body) for r in rows]}


async def request_payload(request: Request):
    raw = await request.body()
    if len(raw) > 120000:
        raise HTTPException(413, "Payload too large.")
    try:
        p = json.loads(raw)
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid JSON.")
    if not isinstance(p, dict):
        raise HTTPException(400, "Payload must be an object.")
    return p


@app.post("/api/requests")
def mutate(
    p: dict = Depends(request_payload),
    user: User = Depends(writer),
    db: DBSession = Depends(get_db),
):
    kind = p.get("kind")
    if kind == "seed":
        for source, r in seeds():
            if not db.scalar(
                select(RequestRecord.id).where(
                    RequestRecord.workspace_id == user.workspace_id,
                    RequestRecord.encounter == r["encounter"],
                )
            ):
                db.add(record(user, r, fingerprint(source)))
        audit(db, user, "demo.seeded", "synthetic-cases")
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        return {"ok": True}
    if kind == "intake":
        try:
            source = EncounterInput.model_validate(p.get("encounter"))
        except Exception:
            raise HTTPException(
                422, "Provide complete synthetic encounter details and valid services."
            )
        r = intake(source, actor=user.name)
        fp = fingerprint(source)
        existing = db.scalar(
            select(RequestRecord).where(
                RequestRecord.workspace_id == user.workspace_id,
                RequestRecord.encounter == r["encounter"],
            )
        )
        if existing:
            return duplicate(existing, fp)
        db.add(record(user, r, fp))
        audit(db, user, "request.created", r["id"])
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = db.scalar(
                select(RequestRecord).where(
                    RequestRecord.workspace_id == user.workspace_id,
                    RequestRecord.encounter == r["encounter"],
                )
            )
            if existing:
                return duplicate(existing, fp)
            raise
        return {"request": r}
    if kind != "action":
        raise HTTPException(400, "Unknown operation.")
    id = p.get("id")
    if not isinstance(id, str) or len(id) > 80:
        raise HTTPException(400, "Invalid request identifier.")
    row = db.scalar(
        select(RequestRecord).where(
            RequestRecord.id == user.workspace_id + ":" + id,
            RequestRecord.workspace_id == user.workspace_id,
        )
    )
    if not row:
        raise HTTPException(404, "Request not found.")
    if type(p.get("version")) is not int or row.version != p["version"]:
        raise HTTPException(
            409, "Request changed. Refresh and review its latest version."
        )
    r = transition(json.loads(row.body), p.get("action"), p, user.name)
    changed = db.execute(
        update(RequestRecord)
        .where(
            RequestRecord.id == row.id,
            RequestRecord.workspace_id == user.workspace_id,
            RequestRecord.version == p["version"],
        )
        .values(body=json.dumps(r), version=r["version"])
    )
    if changed.rowcount != 1:
        raise HTTPException(409, "Concurrent change detected. Refresh and retry.")
    audit(db, user, "request." + p["action"], r["id"])
    db.commit()
    return {"request": r}


def record(user, r, fp):
    return RequestRecord(
        id=user.workspace_id + ":" + r["id"],
        workspace_id=user.workspace_id,
        encounter=r["encounter"],
        body=json.dumps(r),
        fingerprint=fp,
        version=r["version"],
        created_at=r["createdAt"],
    )


def duplicate(row, fp):
    if row.fingerprint != fp:
        raise HTTPException(409, "Encounter ID already exists with different content.")
    return {"request": json.loads(row.body), "duplicate": True}
