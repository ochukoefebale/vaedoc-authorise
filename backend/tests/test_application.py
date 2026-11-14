import time
from fastapi.testclient import TestClient
from sqlalchemy import select
from authorise.main import app
from authorise.database import session_factory
from authorise.models import Invitation, Session, User, Audit
from authorise.security import digest
from conftest import PASSWORD


def create(c, p):
    result = c.post("/api/requests", json={"kind": "intake", "encounter": p})
    assert result.status_code == 200, result.text
    return result.json()["request"]


def action(c, r, name, **extra):
    return c.post(
        "/api/requests",
        json={
            "kind": "action",
            "id": r["id"],
            "version": r["version"],
            "action": name,
            **extra,
        },
    )


def invitation(c, email="new@example.com", role="officer"):
    r = c.post("/api/staff/invitations", json={"email": email, "role": role})
    assert r.status_code == 200, r.text
    return r.json()


def test_unauthenticated_cannot_read_or_write(context):
    c = TestClient(app)
    assert c.get("/api/requests").status_code == 401
    assert c.post("/api/requests", json={"kind": "seed"}).status_code == 401
    assert (
        c.get(
            "/api/auth/me", headers={"oai-authenticated-user-id": "admin"}
        ).status_code
        == 401
    )


def test_login_logout_and_private_cookie(context):
    c = context()
    assert c.get("/api/auth/me").json()["user"]["role"] == "admin"
    assert c.post("/api/auth/logout", json={}).status_code == 200
    assert c.get("/api/requests").status_code == 401


def test_invalid_login_is_generic(context):
    context()
    c = TestClient(app)
    h = {"Origin": "http://testserver"}
    a = c.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "incorrect"},
        headers=h,
    )
    b = c.post(
        "/api/auth/login",
        json={"email": "missing@example.com", "password": "incorrect"},
        headers=h,
    )
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_csrf_and_origin_checks(context):
    c = context()
    assert (
        c.post(
            "/api/requests", json={"kind": "seed"}, headers={"X-CSRF-Token": "wrong"}
        ).status_code
        == 403
    )
    assert (
        c.post(
            "/api/requests",
            json={"kind": "seed"},
            headers={"Origin": "https://attacker.example"},
        ).status_code
        == 403
    )


def test_viewer_has_no_write_or_admin_access(context):
    c = context("viewer@example.com")
    assert c.get("/api/requests").status_code == 200
    assert c.post("/api/requests", json={"kind": "seed"}).status_code == 403
    assert c.get("/api/staff").status_code == 403
    assert c.post("/api/auth/logout", json={}).status_code == 200


def test_officer_can_work_but_cannot_invite(context, encounter):
    c = context("officer@example.com")
    create(c, encounter)
    assert (
        c.post("/api/staff/invitations", json={"email": "new@example.com"}).status_code
        == 403
    )


def test_idempotent_encounter_and_changed_payload(context, encounter):
    c = context()
    first = create(c, encounter)
    repeat = c.post("/api/requests", json={"kind": "intake", "encounter": encounter})
    assert repeat.json()["duplicate"] is True
    assert repeat.json()["request"]["id"] == first["id"]
    encounter["diagnosis"] = "Changed"
    assert (
        c.post(
            "/api/requests", json={"kind": "intake", "encounter": encounter}
        ).status_code
        == 409
    )
    assert len(c.get("/api/requests").json()["requests"]) == 1


def test_hospital_sharing_and_cross_tenant_denial(context, encounter):
    a = context()
    r = create(a, encounter)
    officer = context("officer@example.com")
    assert officer.get("/api/requests").json()["requests"][0]["id"] == r["id"]
    b = context("other@example.com")
    assert b.get("/api/requests").json()["requests"] == []
    assert action(b, r, "cancel").status_code == 404
    create(b, encounter)
    assert len(b.get("/api/requests").json()["requests"]) == 1


def test_full_mixed_decision_and_retry(context, encounter):
    c = context()
    r = create(c, encounter)
    assert action(c, r, "submit", draft=r["draft"]).status_code == 400
    r = action(c, r, "submit", reviewed=True, draft=r["draft"]).json()["request"]
    r = action(c, r, "reply", scenario="partial").json()["request"]
    assert r["items"][0]["outcome"] == "pending"
    ds = r["reply"]["decisions"]
    assert action(c, r, "verify", reviewed=False, decisions=ds).status_code == 400
    r = action(c, r, "verify", reviewed=True, decisions=ds).json()["request"]
    assert [i["outcome"] for i in r["items"]] == ["approved", "denied"]
    event = r["callback"]["eventId"]
    r = action(c, r, "deliver", fail=True).json()["request"]
    assert r["stage"] == "resolved"
    assert r["callback"]["status"] == "failed"
    r = action(c, r, "deliver").json()["request"]
    assert r["callback"]["status"] == "acknowledged"
    assert r["callback"]["eventId"] == event
    assert r["callback"]["attempts"] == 2
    assert action(c, r, "deliver").status_code == 409
    with session_factory()() as db:
        assert (
            len(db.scalars(select(Audit).where(Audit.action == "request.verify")).all())
            == 1
        )


def test_stale_version_rejected(context, encounter):
    c = context()
    r = create(c, encounter)
    assert (
        action(c, r, "saveDraft", draft="Reviewed synthetic draft").status_code == 200
    )
    assert action(c, r, "cancel").status_code == 409


def test_query_does_not_approve_and_cancellation_preserves_history(context, encounter):
    c = context()
    r = create(c, encounter)
    r = action(c, r, "submit", reviewed=True, draft=r["draft"]).json()["request"]
    r = action(c, r, "reply", scenario="query").json()["request"]
    assert r["stage"] == "query"
    assert all(i["outcome"] == "pending" for i in r["items"])
    assert r["callback"] is None
    r = action(c, r, "cancel").json()["request"]
    assert r["stage"] == "cancelled"
    assert r["submittedDraft"]
    assert action(c, r, "submit", reviewed=True, draft=r["draft"]).status_code == 409


def test_invalid_item_quantities_codes_and_real_data(context, encounter):
    c = context()
    encounter["synthetic"] = False
    assert (
        c.post(
            "/api/requests", json={"kind": "intake", "encounter": encounter}
        ).status_code
        == 400
    )
    encounter["synthetic"] = True
    r = create(c, encounter)
    r = action(c, r, "submit", reviewed=True, draft=r["draft"]).json()["request"]
    r = action(c, r, "reply", scenario="approved").json()["request"]
    ds = r["reply"]["decisions"]
    ds[0]["code"] = ""
    assert action(c, r, "verify", reviewed=True, decisions=ds).status_code == 400
    ds[0]["code"] = "DEMO-PA"
    ds[0]["approvedQuantity"] = 999
    assert action(c, r, "verify", reviewed=True, decisions=ds).status_code == 400


def test_invite_is_email_bound_one_time_and_hashed(context):
    c = context()
    inv = invitation(c)
    token = inv["url"].split("#token=")[1]
    with session_factory()() as db:
        row = db.get(Invitation, inv["id"])
        assert row.token_hash == digest(token)
        assert token not in row.token_hash
    guest = TestClient(app)
    guest.headers["Origin"] = "http://testserver"
    payload = {
        "token": token,
        "email": "different@example.com",
        "name": "New Staff",
        "password": PASSWORD,
    }
    assert guest.post("/api/auth/accept-invite", json=payload).status_code == 400
    payload["email"] = "new@example.com"
    assert guest.post("/api/auth/accept-invite", json=payload).status_code == 200
    assert guest.post("/api/auth/accept-invite", json=payload).status_code == 400
    logged = context("new@example.com")
    assert logged.get("/api/auth/me").json()["user"]["role"] == "officer"


def test_revocation_expiry_and_superseding_invite(context):
    c = context()
    old = invitation(c)
    new = invitation(c)
    with session_factory()() as db:
        assert db.get(Invitation, old["id"]).revoked
        row = db.get(Invitation, new["id"])
        row.expires_at = int(time.time()) - 1
        db.commit()
    guest = TestClient(app)
    payload = {
        "token": new["url"].split("#token=")[1],
        "email": "new@example.com",
        "name": "New Staff",
        "password": PASSWORD,
    }
    assert (
        guest.post(
            "/api/auth/accept-invite",
            json=payload,
            headers={"Origin": "http://testserver"},
        ).status_code
        == 400
    )
    fresh = invitation(c)
    assert (
        c.post("/api/staff/invitations/" + fresh["id"] + "/revoke", json={}).status_code
        == 200
    )
    with session_factory()() as db:
        assert db.get(Invitation, fresh["id"]).revoked


def test_deactivation_invalidates_existing_sessions(context):
    admin = context()
    officer = context("officer@example.com")
    assert admin.post("/api/staff/officer", json={"active": False}).status_code == 200
    assert officer.get("/api/requests").status_code == 401
    assert admin.post("/api/staff/admin", json={"active": False}).status_code == 400


def test_cannot_invite_administrator_or_change_other_hospital(context):
    c = context()
    assert (
        c.post(
            "/api/staff/invitations", json={"email": "new@example.com", "role": "admin"}
        ).status_code
        == 400
    )
    assert c.post("/api/staff/other", json={"active": False}).status_code == 404


def test_expired_session_and_login_rate_limit(context):
    c = context()
    with session_factory()() as db:
        row = db.scalar(select(Session))
        row.expires_at = int(time.time()) - 1
        db.commit()
    assert c.get("/api/requests").status_code == 401
    c = TestClient(app)
    for _ in range(10):
        result = c.post(
            "/api/auth/login",
            json={"email": "missing@example.com", "password": "incorrect"},
            headers={"Origin": "http://testserver"},
        )
    assert result.status_code == 401
    result = c.post(
        "/api/auth/login",
        json={"email": "missing@example.com", "password": "incorrect"},
        headers={"Origin": "http://testserver"},
    )
    assert result.status_code == 429
