from alembic import context
from authorise.database import engine, Base
from authorise import models

config = context.config
if context.is_offline_mode():
    raise RuntimeError("Use an explicit database connection for migrations.")
with engine().connect() as connection:
    context.configure(
        connection=connection, target_metadata=Base.metadata, compare_type=True
    )
    with context.begin_transaction():
        context.run_migrations()
