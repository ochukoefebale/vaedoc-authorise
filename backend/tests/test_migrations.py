from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import mysql, postgresql
from authorise.database import engine, Base
from authorise import models


def test_initial_migration_and_schema_dialects(tmp_path, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///" + str(tmp_path / "migration.db"))
    engine.cache_clear()
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(cfg, "head")
    tables = inspect(engine()).get_table_names()
    assert "va_users" in tables and "va_sessions" in tables and "va_requests" in tables
    command.upgrade(cfg, "head")
    for dialect in [mysql.dialect(), postgresql.dialect()]:
        for table in Base.metadata.sorted_tables:
            assert "CREATE TABLE" in str(CreateTable(table).compile(dialect=dialect))
    engine().dispose()
    engine.cache_clear()
