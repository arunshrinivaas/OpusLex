import logging
import os
from functools import lru_cache
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

_backend_env = Path(__file__).resolve().parent.parent / ".env"
if _backend_env.exists():
    load_dotenv(dotenv_path=_backend_env, override=False)
else:
    load_dotenv(override=False)

INSECURE_DEFAULT_JWT_SECRETS = {
    "change-this-in-production-use-a-long-random-string",
    "secret",
    "secret123",
    "default",
    "changeme",
    "password",
    "admin",
    "jwt_secret",
    "jwtsecret",
    "your-secret-key",
    "development_secret_key",
}

DEV_FALLBACK_JWT_SECRET = "change-this-in-production-use-a-long-random-string"
MIN_JWT_SECRET_LENGTH = 32

DEFAULT_DEV_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
]

DEV_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$"
VALID_LLM_PROVIDERS = {"copilot", "ollama", "mock"}


def parse_cors_origins(raw_cors: str | list | tuple | set | None) -> list[str]:
    """
    Parses CORS origins from a comma-separated string, JSON list, or sequence.
    Normalizes origins by stripping whitespace, surrounding quotes/brackets, and trailing slashes.
    """
    if raw_cors is None:
        return []
    if isinstance(raw_cors, (list, tuple, set)):
        items = list(raw_cors)
    elif isinstance(raw_cors, str):
        cleaned = raw_cors.strip()
        if not cleaned:
            return []
        if cleaned.startswith("[") and cleaned.endswith("]"):
            try:
                import json
                items = json.loads(cleaned)
            except Exception:
                items = cleaned.split(",")
        else:
            items = cleaned.split(",")
    else:
        return []

    parsed: list[str] = []
    for item in items:
        if isinstance(item, str):
            origin = item.strip().strip("'\"[]").rstrip("/")
            if origin and origin not in parsed:
                parsed.append(origin)
    return parsed


def validate_cors(origins: list[str], allow_credentials: bool = True, debug: bool = False) -> None:
    """
    Enforces production CORS security constraints:
    1. Rejects unrestricted wildcard '*' origin when allow_credentials is True.
    2. When debug is False (production mode):
       - If origins is empty, logs that fail-closed mode is active (all cross-origin requests rejected).
       - Warns if any origin uses unencrypted HTTP in production.
    """
    if allow_credentials and any(origin == "*" for origin in origins):
        raise ValueError(
            "Invalid CORS configuration: Unrestricted wildcard '*' origin is not permitted when allow_credentials is True. "
            "Explicit trusted origins must be specified in CORS_ORIGINS."
        )
    if not debug:
        if not origins:
            logger.warning(
                "Production CORS policy: No CORS origins configured. "
                "Application will operate in fail-closed mode (all cross-origin requests rejected)."
            )
        for origin in origins:
            if origin.startswith("http://") and not (origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1")):
                logger.warning(
                    "Production CORS warning: Origin '%s' uses insecure HTTP scheme instead of HTTPS.",
                    origin,
                )


def validate_jwt_secret(jwt_secret: str | None, debug: bool = False) -> None:
    """
    Enforces production-grade secret requirements on the JWT secret.

    When debug is False (production mode):
      1. Secret must be present and non-empty.
      2. Secret must not match any known default, placeholder, or example string.
      3. Secret must be at least 32 characters long.

    If any check fails, raises ValueError with a descriptive error message that
    NEVER logs, displays, or reveals the secret value or its characters.

    When debug is True (development/test mode):
      Permits development fallback or shorter secrets for local development ergonomics,
      emitting a log warning when a development secret is used.
    """
    if not debug:
        if not jwt_secret or not str(jwt_secret).strip():
            raise ValueError(
                "Invalid production configuration: JWT_SECRET environment variable is missing or empty. "
                "A secure secret of at least 32 characters must be provided when DEBUG=false."
            )
        cleaned = str(jwt_secret).strip()
        if cleaned.lower() in INSECURE_DEFAULT_JWT_SECRETS:
            raise ValueError(
                "Invalid production configuration: JWT_SECRET is set to an insecure default or placeholder value. "
                "A unique, cryptographically strong secret of at least 32 characters must be provided when DEBUG=false."
            )
        if len(cleaned) < MIN_JWT_SECRET_LENGTH:
            raise ValueError(
                "Invalid production configuration: JWT_SECRET is too short. "
                f"Production JWT secrets must be at least {MIN_JWT_SECRET_LENGTH} characters long."
            )
    else:
        # Development / Debug mode
        if (
            not jwt_secret
            or str(jwt_secret).strip().lower() in INSECURE_DEFAULT_JWT_SECRETS
            or len(str(jwt_secret).strip()) < MIN_JWT_SECRET_LENGTH
        ):
            logger.warning(
                "DEBUG mode active: using development JWT secret. "
                "Do NOT use this configuration in production (DEBUG=false)."
            )


class Settings:
    app_name: str = "Legal & Compliance Research Assistant"
    app_version: str = "1.0.0"
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    demo_mode: bool = os.getenv("DEMO_MODE", "false").lower() == "true"

    # Database
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/legal_compliance",
    )

    # Redis
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # JWT
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60 * 24  # 24 hours

    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)

        if "debug" in kwargs:
            self.debug = kwargs["debug"]
        else:
            self.debug = os.getenv("DEBUG", "false").lower() == "true"

        if "demo_mode" in kwargs:
            self.demo_mode = kwargs["demo_mode"]
        else:
            self.demo_mode = os.getenv("DEMO_MODE", "false").lower() == "true"

        if "database_url" in kwargs:
            self.database_url = kwargs["database_url"]
        else:
            self.database_url = os.getenv(
                "DATABASE_URL",
                "postgresql+psycopg://postgres:postgres@localhost:5432/legal_compliance",
            )

        if "redis_url" in kwargs:
            self.redis_url = kwargs["redis_url"]
        else:
            self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

        # JWT Secret Resolution
        if "jwt_secret" in kwargs:
            raw_secret = kwargs["jwt_secret"]
        else:
            raw_secret = os.getenv("JWT_SECRET")

        if self.debug:
            self.jwt_secret = raw_secret if (raw_secret is not None and str(raw_secret).strip()) else DEV_FALLBACK_JWT_SECRET
        else:
            # Production: never silently substitute a development secret
            self.jwt_secret = raw_secret if raw_secret is not None else ""

        # LLM Provider Resolution
        if "llm_provider" in kwargs:
            self.llm_provider = kwargs["llm_provider"]
        else:
            self.llm_provider = os.getenv("LLM_PROVIDER", "copilot")

        # CORS Resolution
        raw_cors = kwargs.get("cors_origins") if "cors_origins" in kwargs else (os.getenv("CORS_ORIGINS") or os.getenv("ALLOWED_ORIGINS"))
        parsed_origins = parse_cors_origins(raw_cors)

        if self.debug:
            merged = list(DEFAULT_DEV_CORS_ORIGINS)
            for o in parsed_origins:
                if o not in merged:
                    merged.append(o)
            self.cors_origins = merged
            self.cors_origin_regex = DEV_ORIGIN_REGEX
        else:
            # Production: strictly explicit origins, no localhost injection, no LAN regex
            self.cors_origins = parsed_origins
            self.cors_origin_regex = None

        self.cors_allow_credentials = True

        self.validate()

    def validate(self) -> None:
        """Enforces runtime configuration validation."""
        validate_jwt_secret(self.jwt_secret, debug=self.debug)
        validate_cors(self.cors_origins, allow_credentials=self.cors_allow_credentials, debug=self.debug)
        if self.llm_provider not in VALID_LLM_PROVIDERS:
            raise ValueError(
                f"Invalid LLM provider '{self.llm_provider}'. Supported providers are: {sorted(VALID_LLM_PROVIDERS)}"
            )
        if not self.debug and self.llm_provider == "mock":
            logger.warning("Production warning: Running with mock LLM provider in production (DEBUG=false).")

    # Ollama / LLM
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3.2")
    llm_provider: str = os.getenv("LLM_PROVIDER", "copilot")  # "copilot", "ollama", or "mock"

    # LangGraph Multi-Agent Configuration
    langgraph_max_retries: int = int(os.getenv("LANGGRAPH_MAX_RETRIES", "2"))
    langgraph_node_timeout_seconds: float = float(
        os.getenv("LANGGRAPH_NODE_TIMEOUT", "60.0")
    )

    # Embeddings
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

    # CORS
    cors_origins: list[str] = []
    cors_origin_regex: str | None = None
    cors_allow_credentials: bool = True

    # OpenTelemetry
    otel_exporter_otlp_endpoint: str = os.getenv(
        "OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"
    )
    otel_service_name: str = "legal-compliance-backend"

    # Upload
    upload_dir: str = os.getenv("UPLOAD_DIR", "uploads")

    # Google OAuth
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    oauth_encryption_key: str = os.getenv("OAUTH_ENCRYPTION_KEY", "")

    # Apple OAuth
    apple_client_id: str = os.getenv("APPLE_CLIENT_ID", "")

    # Twilio Verify
    twilio_account_sid: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    twilio_auth_token: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    twilio_verify_service_sid: str = os.getenv("TWILIO_VERIFY_SERVICE_SID", "")

    # SMTP / Email
    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_user: str = os.getenv("SMTP_USER", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_from_email: str = os.getenv("SMTP_FROM_EMAIL", "no-reply@opuslex.com")

_settings = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


settings = get_settings()
