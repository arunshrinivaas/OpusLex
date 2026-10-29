import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

import app.models
from app.config import settings, Settings
from app.database import get_db

logger = logging.getLogger(__name__)

from app.routers import (
    agent,
    audit,
    auth,
    compliance,
    document,
    governance,
    investigations,
    investigations_presence,
    investigations_collaborator,
    policies,
    rag,
    regulations,
    research,
    knowledge,
    workspace,
    help,
    integrations,
    mcp,
    assistant,
)

def create_app(custom_settings: Settings | None = None) -> FastAPI:
    cfg = custom_settings or settings

    @asynccontextmanager
    async def app_lifespan(application: FastAPI):
        # Enforce fail-fast configuration validation at application startup
        cfg.validate()
        async with mcp.mcp_server.session_manager.run():
            yield

    app_instance = FastAPI(
        title=cfg.app_name,
        version=cfg.app_version,
        lifespan=app_lifespan,
    )

    # CORS configuration driven strictly by settings
    app_instance.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_origin_regex=cfg.cors_origin_regex,
        allow_credentials=cfg.cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app_instance.include_router(auth.router)
    app_instance.include_router(regulations.router)
    app_instance.include_router(policies.router)
    app_instance.include_router(compliance.router)
    app_instance.include_router(research.router)
    app_instance.include_router(document.router)
    app_instance.include_router(rag.router)
    app_instance.include_router(investigations.router)
    app_instance.include_router(investigations_presence.router)
    app_instance.include_router(investigations_collaborator.router)
    app_instance.include_router(agent.router)
    app_instance.include_router(knowledge.router)
    app_instance.include_router(workspace.router)
    app_instance.include_router(audit.router)
    app_instance.include_router(governance.router)
    app_instance.include_router(help.router)
    app_instance.include_router(integrations.router)
    app_instance.include_router(assistant.router)
    from app.routers import data
    app_instance.include_router(data.router)

    app_instance.mount("/api/v1/mcp", mcp.AuthBridgeMiddleware(mcp.mcp_app))

    @app_instance.get("/")
    def root():
        return {
            "name": cfg.app_name,
            "version": cfg.app_version,
            "status": "running",
        }

    @app_instance.get("/health", status_code=status.HTTP_200_OK)
    def health():
        """
        Lightweight liveness probe indicating the HTTP server process is running and accepting requests.
        Remains independent of downstream database availability to prevent cascading restarts.
        """
        return {
            "status": "healthy",
            "app": cfg.app_name,
            "version": cfg.app_version,
        }

    @app_instance.get("/ready")
    def ready(response: Response, db: Session = Depends(get_db)):
        """
        Database-aware readiness probe for container orchestrators and ingress gateways.
        Executes a lightweight query (SELECT 1) against the configured database.
        Returns HTTP 200 when the database connection succeeds.
        Returns HTTP 503 when the database connection fails or is unavailable.
        Never exposes database credentials, hostnames, or connection strings in responses.
        """
        try:
            db.execute(text("SELECT 1"))
            return {
                "status": "ready",
                "database": "connected",
            }
        except Exception as exc:
            logger.warning("Database readiness probe failed: %s", type(exc).__name__)
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return {
                "status": "not_ready",
                "reason": "database_unavailable",
            }

    return app_instance


app = create_app()