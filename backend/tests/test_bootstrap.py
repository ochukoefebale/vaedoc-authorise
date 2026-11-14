import hashlib
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from authorise.bootstrap import initialise_admin
from authorise.database import Base, engine, session_factory
from authorise.main import app
from authorise.models import Invitation, User, Workspace


def test_initial_admin_invitation(tmp_path, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("APP_URL", "http://testserver")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///" + str(tmp_path / "bootstrap.db"))
    engine.cache_clear()
    Base.metadata.create_all(engine())
    token = "synthetic-bootstrap-token-for-automated-test-only"
    digest = hashlib.sha256(token.encode()).hexdigest()
    try:
        assert "created" in initialise_admin("admin@example.com", digest)
        assert "already exists" in initialise_admin("admin@example.com", digest)
        with pytest.raises(ValueError):
            initialise_admin("other@example.com", digest)
        with session_factory()() as db:
            assert db.scalar(select(func.count()).select_from(Invitation)) == 1
            assert db.scalar(select(func.count()).select_from(Workspace)) == 1
        with TestClient(app) as client:
            result = client.post("/api/auth/accept-invite", headers={"Origin": "http://testserver"}, json={
                "token": token, "email": "admin@example.com", "name": "Demo Admin",
                "password": "Synthetic test password 123!",
            })
            assert result.status_code == 200, result.text
            assert client.post("/api/auth/accept-invite", headers={"Origin": "http://testserver"}, json={
                "token": token, "email": "admin@example.com", "name": "Demo Admin",
                "password": "Synthetic test password 123!",
            }).status_code != 200
        assert "completed" in initialise_admin("other@example.com", "a" * 64)
        with session_factory()() as db:
            user = db.scalar(select(User))
            assert user.role == "admin" and user.email == "admin@example.com"
    finally:
        engine().dispose()
        engine.cache_clear()


def test_existing_installation_cannot_be_bootstrapped(context):
    assert "completed" in initialise_admin("new@example.com", "a" * 64)
