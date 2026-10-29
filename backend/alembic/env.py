import os
import sys
from logging.config import fileConfig

from dotenv import load_dotenv
from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=env_path)

sys.path.insert(
    0,
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..")
    ),
)

config = context.config

db_url = os.getenv("DATABASE_URL")
if not db_url:
    raise ValueError("DATABASE_URL environment variable is missing or empty.")

config.set_main_option(
    "sqlalchemy.url",
    db_url,
)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


from app.models.base import Base
from app.models.user import User
from app.models.regulation import Regulation
from app.models.policy import Policy
from app.models.compliance import Compliance
from app.models.research import ResearchQuery
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.investigation import Investigation
from app.models.investigation_query import InvestigationQuery
from app.models.agent_run import AgentRun  # noqa: F401
from app.models.assistant import AssistantPreference, AssistantAuditLog  # noqa: F401


target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in offline mode."""

    url = config.get_main_option("sqlalchemy.url")

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in online mode."""

    connectable = engine_from_config(
        config.get_section(
            config.config_ini_section,
            {},
        ),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()