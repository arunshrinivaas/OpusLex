"""
Stage 7A Tests: Security Hardening and Database-Aware Readiness.

Covers:
1. Production JWT secret fail-fast validation (Task 1):
   - Missing/empty secret when DEBUG=false raises ValueError.
   - Known default/fallback placeholder secret when DEBUG=false raises ValueError.
   - Insecure common placeholder secrets when DEBUG=false raises ValueError.
   - Too-short secrets (< 32 chars) when DEBUG=false raises ValueError.
   - Valid production secrets (>= 32 chars) when DEBUG=false pass cleanly.
   - Development mode (DEBUG=true) permits dev fallback without exception.
   - Error messages never expose or echo the secret value.
   - Startup lifespan fail-fast verification.

2. Database-Aware Readiness & Liveness Probes (Task 2):
   - /ready returns 200 {"status": "ready", "database": "connected"} on healthy DB.
   - /ready returns 503 {"status": "not_ready", "reason": "database_unavailable"} on DB failure.
   - Response contains no credentials, connection strings, or host details.
   - /health (liveness) returns 200 {"status": "healthy"} independently of DB status.
   - Database session resource cleanup verified.
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.config import (
    Settings,
    validate_jwt_secret,
    INSECURE_DEFAULT_JWT_SECRETS,
    DEV_FALLBACK_JWT_SECRET,
    MIN_JWT_SECRET_LENGTH,
)
from app.main import app
from app.database import get_db

client = TestClient(app)


# =====================================================================
# Task 1: Production JWT Secret Requirements Tests
# =====================================================================

class TestProductionJWTSecretValidation:
    """Tests fail-fast production JWT secret enforcement and dev ergonomics."""

    @pytest.mark.parametrize("empty_val", [None, "", "   ", "\t\n"])
    def test_production_rejects_missing_or_empty_secret(self, empty_val):
        """When DEBUG=false, missing or whitespace-only secret raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            validate_jwt_secret(empty_val, debug=False)
        msg = str(exc_info.value)
        assert "JWT_SECRET environment variable is missing or empty" in msg
        assert "DEBUG=false" in msg

    @pytest.mark.parametrize("insecure_secret", list(INSECURE_DEFAULT_JWT_SECRETS))
    def test_production_rejects_known_default_and_insecure_secrets(self, insecure_secret):
        """When DEBUG=false, known default and insecure placeholder secrets are rejected."""
        with pytest.raises(ValueError) as exc_info:
            validate_jwt_secret(insecure_secret, debug=False)
        msg = str(exc_info.value)
        assert "insecure default or placeholder" in msg

    @pytest.mark.parametrize("short_secret", [
        "a",
        "short",
        "12345678901234567890",
        "only-31-chars-long-12345678901",  # 31 chars
    ])
    def test_production_rejects_secrets_under_32_characters(self, short_secret):
        """When DEBUG=false, secrets with fewer than 32 characters are rejected."""
        assert len(short_secret) < 32
        with pytest.raises(ValueError) as exc_info:
            validate_jwt_secret(short_secret, debug=False)
        msg = str(exc_info.value)
        assert "JWT_SECRET is too short" in msg
        assert "at least 32 characters" in msg

    @pytest.mark.parametrize("valid_secret", [
        "a" * 32,
        "valid-production-secret-min-32-chars-long",
        "c8f7d9a1e2b34567890abcdef1234567890abcdef12",  # 44 chars
        "x" * 64,
        "x" * 128,
    ])
    def test_production_accepts_valid_strong_secrets(self, valid_secret):
        """When DEBUG=false, unique secrets >= 32 characters validate successfully."""
        assert len(valid_secret) >= 32
        assert valid_secret.lower() not in INSECURE_DEFAULT_JWT_SECRETS
        # Should not raise any exception
        validate_jwt_secret(valid_secret, debug=False)

    def test_development_mode_permits_dev_fallback_without_error(self):
        """When DEBUG=true, dev fallback or shorter secret is accepted with a warning."""
        # Should not raise exception
        validate_jwt_secret(None, debug=True)
        validate_jwt_secret(DEV_FALLBACK_JWT_SECRET, debug=True)
        validate_jwt_secret("short-dev-secret", debug=True)

    def test_settings_instantiation_production_no_silent_fallback(self):
        """Settings in production mode never silently substitutes a development secret."""
        # Instantiating Settings with debug=False and empty secret must fail fast
        with pytest.raises(ValueError) as exc_info:
            Settings(debug=False, jwt_secret="")
        assert "missing or empty" in str(exc_info.value)

        # Instantiating with default secret must fail fast
        with pytest.raises(ValueError) as exc_info:
            Settings(debug=False, jwt_secret=DEV_FALLBACK_JWT_SECRET)
        assert "insecure default or placeholder" in str(exc_info.value)

        # Instantiating with short secret must fail fast
        with pytest.raises(ValueError) as exc_info:
            Settings(debug=False, jwt_secret="too-short-12345")
        assert "too short" in str(exc_info.value)

    def test_settings_instantiation_development_uses_dev_fallback(self):
        """Settings in debug mode uses development fallback when secret is omitted."""
        s = Settings(debug=True, jwt_secret="")
        assert s.jwt_secret == DEV_FALLBACK_JWT_SECRET

        s2 = Settings(debug=True, jwt_secret=None)
        assert s2.jwt_secret == DEV_FALLBACK_JWT_SECRET

    def test_settings_instantiation_production_valid(self):
        """Settings in production mode succeeds with valid 32+ character secret."""
        synthetic_secret = "synthetic-prod-secret-32-chars-long-ok"
        s = Settings(debug=False, jwt_secret=synthetic_secret)
        assert s.jwt_secret == synthetic_secret
        assert s.debug is False

    def test_confidentiality_error_message_does_not_reveal_secret(self):
        """Ensure that error messages for invalid secrets NEVER print the secret."""
        secret_probe = "UNSAFE_PROBE_SECRET_123456789"  # 29 chars
        with pytest.raises(ValueError) as exc_info:
            validate_jwt_secret(secret_probe, debug=False)
        assert secret_probe not in str(exc_info.value)


# =====================================================================
# Task 2: Database-Aware Readiness and Liveness Probes Tests
# =====================================================================

class TestReadinessAndLivenessProbes:
    """Tests the /ready and /health endpoints under normal and degraded conditions."""

    def test_health_liveness_returns_200_ok(self):
        """Liveness endpoint returns 200 OK with app name and version."""
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
        assert "app" in data
        assert "version" in data

    def test_ready_successful_db_probe(self):
        """Readiness returns 200 {"status": "ready", "database": "connected"} when DB probe succeeds."""
        mock_session = MagicMock()
        mock_session.execute.return_value = MagicMock()

        def mock_get_db():
            try:
                yield mock_session
            finally:
                pass

        app.dependency_overrides[get_db] = mock_get_db
        try:
            res = client.get("/ready")
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "ready"
            assert data["database"] == "connected"
            mock_session.execute.assert_called_once()
        finally:
            app.dependency_overrides.pop(get_db, None)

    def test_ready_failed_db_probe_returns_503(self):
        """Readiness returns 503 {"status": "not_ready", "reason": "database_unavailable"} when DB probe fails."""
        mock_session = MagicMock()
        mock_session.execute.side_effect = OperationalError("connection refused", {}, None)

        def mock_get_db():
            try:
                yield mock_session
            finally:
                pass

        app.dependency_overrides[get_db] = mock_get_db
        try:
            res = client.get("/ready")
            assert res.status_code == 503
            data = res.json()
            assert data["status"] == "not_ready"
            assert data["reason"] == "database_unavailable"

            # Strict security check: no connection strings, credentials, or host details in response
            body_str = res.text.lower()
            for sensitive_kw in ["password", "postgres", "localhost", "5432", "connection refused", "traceback"]:
                assert sensitive_kw not in body_str, f"Leaked sensitive detail in /ready response: {sensitive_kw}"
        finally:
            app.dependency_overrides.pop(get_db, None)

    def test_health_liveness_remains_healthy_during_database_outage(self):
        """
        Liveness semantics guarantee: A temporary database outage does NOT cause /health to fail.
        This prevents container orchestrators (e.g. Kubernetes) from restarting the pod during DB blips.
        """
        mock_session = MagicMock()
        mock_session.execute.side_effect = OperationalError("DB is down", {}, None)

        def mock_get_db():
            try:
                yield mock_session
            finally:
                pass

        app.dependency_overrides[get_db] = mock_get_db
        try:
            # /ready must fail (503)
            ready_res = client.get("/ready")
            assert ready_res.status_code == 503

            # /health must STILL succeed (200)
            health_res = client.get("/health")
            assert health_res.status_code == 200
            assert health_res.json()["status"] == "healthy"
        finally:
            app.dependency_overrides.pop(get_db, None)

    def test_ready_connection_resources_cleaned_up(self):
        """Verify database session close() is guaranteed after readiness probe execution."""
        mock_session = MagicMock()
        mock_session.execute.return_value = MagicMock()
        session_closed = False

        def tracking_get_db():
            nonlocal session_closed
            try:
                yield mock_session
            finally:
                session_closed = True

        app.dependency_overrides[get_db] = tracking_get_db
        try:
            res = client.get("/ready")
            assert res.status_code == 200
            assert session_closed is True
            mock_session.execute.assert_called_once()
        finally:
            app.dependency_overrides.pop(get_db, None)


# =====================================================================
# Task 3: Production CORS Behavior Tests
# =====================================================================

class TestProductionCORSBehavior:
    """Verifies production CORS lockdown, origin validation, and dev ergonomics."""

    def test_explicit_production_origins_accepted(self):
        """In production (DEBUG=false), explicitly configured origins in CORS_ORIGINS are accepted."""
        prod_settings = Settings(
            debug=False,
            jwt_secret="a" * 32,
            cors_origins="https://app.opuslex.com, https://admin.opuslex.com",
        )
        assert prod_settings.cors_origins == ["https://app.opuslex.com", "https://admin.opuslex.com"]
        assert prod_settings.cors_origin_regex is None

        from app.main import create_app
        prod_app = create_app(prod_settings)
        prod_client = TestClient(prod_app)

        # 1. Simple GET with allowed origin
        res = prod_client.get("/health", headers={"Origin": "https://app.opuslex.com"})
        assert res.status_code == 200
        assert res.headers.get("access-control-allow-origin") == "https://app.opuslex.com"
        assert res.headers.get("access-control-allow-credentials") == "true"

        # 2. Preflight OPTIONS request
        preflight = prod_client.options(
            "/api/v1/auth/login",
            headers={
                "Origin": "https://admin.opuslex.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers.get("access-control-allow-origin") == "https://admin.opuslex.com"
        assert preflight.headers.get("access-control-allow-credentials") == "true"

    def test_unapproved_origins_rejected(self):
        """Unapproved origins must not receive CORS headers and preflights must be rejected."""
        prod_settings = Settings(
            debug=False,
            jwt_secret="a" * 32,
            cors_origins="https://app.opuslex.com",
        )
        from app.main import create_app
        prod_app = create_app(prod_settings)
        prod_client = TestClient(prod_app)

        # 1. Simple GET from unapproved origin receives NO access-control-allow-origin
        res = prod_client.get("/health", headers={"Origin": "https://malicious-site.com"})
        assert res.status_code == 200
        assert "access-control-allow-origin" not in res.headers

        # 2. Preflight OPTIONS from unapproved origin is rejected with 400
        preflight = prod_client.options(
            "/api/v1/auth/login",
            headers={
                "Origin": "https://attacker.org",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert preflight.status_code == 400
        assert "access-control-allow-origin" not in preflight.headers

    def test_development_only_origins_and_private_ips_disabled_in_production(self):
        """When DEBUG=false, localhost, 127.0.0.1, and private LAN IPs (192.168.*, 10.*) are rejected."""
        prod_settings = Settings(
            debug=False,
            jwt_secret="a" * 32,
            cors_origins="https://app.opuslex.com",
        )
        assert prod_settings.cors_origin_regex is None
        from app.main import create_app
        prod_app = create_app(prod_settings)
        prod_client = TestClient(prod_app)

        forbidden_origins = [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:8000",
            "http://192.168.1.100:3000",
            "http://192.168.0.5:5173",
            "http://10.0.0.15:3000",
            "http://172.16.0.2:3000",
        ]

        for origin in forbidden_origins:
            res = prod_client.get("/health", headers={"Origin": origin})
            assert "access-control-allow-origin" not in res.headers, f"Origin {origin} was improperly permitted in production!"

    def test_missing_production_cors_fails_safely_closed(self):
        """When CORS_ORIGINS is missing or empty in production, application operates in fail-closed mode."""
        prod_settings = Settings(
            debug=False,
            jwt_secret="a" * 32,
            cors_origins="",
        )
        assert prod_settings.cors_origins == []
        assert prod_settings.cors_origin_regex is None

        from app.main import create_app
        prod_app = create_app(prod_settings)
        prod_client = TestClient(prod_app)

        # Cross-origin requests fail closed
        res = prod_client.get("/health", headers={"Origin": "https://app.opuslex.com"})
        assert res.status_code == 200
        assert "access-control-allow-origin" not in res.headers

    def test_malformed_production_cors_normalizes_safely(self):
        """Whitespace, trailing slashes, JSON syntax, and redundant commas are sanitized safely."""
        # 1. Trailing slashes and spaces
        s1 = Settings(
            debug=False,
            jwt_secret="a" * 32,
            cors_origins="  https://app.opuslex.com/ , , https://portal.opuslex.com/  ",
        )
        assert s1.cors_origins == ["https://app.opuslex.com", "https://portal.opuslex.com"]

        # 2. JSON array string
        s2 = Settings(
            debug=False,
            jwt_secret="a" * 32,
            cors_origins='["https://app.opuslex.com", "https://portal.opuslex.com"]',
        )
        assert s2.cors_origins == ["https://app.opuslex.com", "https://portal.opuslex.com"]

        # 3. Malformed pseudo-JSON fallback
        s3 = Settings(
            debug=False,
            jwt_secret="a" * 32,
            cors_origins='["https://app.opuslex.com", "https://portal.opuslex.com"',
        )
        assert "https://app.opuslex.com" in s3.cors_origins
        assert "https://portal.opuslex.com" in s3.cors_origins

    def test_credentialed_cors_rejects_unrestricted_wildcard(self):
        """When credentials are enabled, wildcard '*' origin is strictly forbidden and raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            Settings(
                debug=False,
                jwt_secret="a" * 32,
                cors_origins="*",
            )
        msg = str(exc_info.value)
        assert "Unrestricted wildcard '*' origin is not permitted" in msg
        assert "allow_credentials is True" in msg

        with pytest.raises(ValueError) as exc_info2:
            Settings(
                debug=False,
                jwt_secret="a" * 32,
                cors_origins="https://app.opuslex.com, *",
            )
        assert "Unrestricted wildcard '*' origin is not permitted" in str(exc_info2.value)

    def test_dev_mode_enables_localhost_and_lan_convenience(self):
        """In development mode (DEBUG=true), default localhost ports and LAN IP regex are active."""
        dev_settings = Settings(
            debug=True,
            jwt_secret="dev-secret",
            cors_origins="https://preview.local",
        )
        assert "http://localhost:3000" in dev_settings.cors_origins
        assert "http://localhost:5173" in dev_settings.cors_origins
        assert "https://preview.local" in dev_settings.cors_origins
        assert dev_settings.cors_origin_regex is not None

        from app.main import create_app
        dev_app = create_app(dev_settings)
        dev_client = TestClient(dev_app)

        # Localhost allowed
        res1 = dev_client.get("/health", headers={"Origin": "http://localhost:5173"})
        assert res1.headers.get("access-control-allow-origin") == "http://localhost:5173"

        # LAN IP allowed via regex
        res2 = dev_client.get("/health", headers={"Origin": "http://192.168.1.45:5173"})
        assert res2.headers.get("access-control-allow-origin") == "http://192.168.1.45:5173"

        # Explicit custom origin allowed
        res3 = dev_client.get("/health", headers={"Origin": "https://preview.local"})
        assert res3.headers.get("access-control-allow-origin") == "https://preview.local"


# =====================================================================
# Task 4: Deployment Configuration Verification Tests
# =====================================================================

class TestDeploymentConfiguration:
    """Verifies configuration precedence, LLM provider selection, and operational safeguards."""

    def test_environment_variable_precedence(self):
        """Verify kwargs take precedence over os.environ, and os.environ takes precedence over defaults."""
        with patch.dict("os.environ", {"JWT_SECRET": "env_secret_" + "x" * 25, "LLM_PROVIDER": "ollama"}):
            s = Settings(debug=False)
            assert s.jwt_secret == "env_secret_" + "x" * 25
            assert s.llm_provider == "ollama"

            # Direct kwarg override
            s_override = Settings(debug=False, jwt_secret="override_" + "y" * 25, llm_provider="copilot")
            assert s_override.jwt_secret == "override_" + "y" * 25
            assert s_override.llm_provider == "copilot"

    def test_llm_provider_validation(self):
        """Supported LLM providers are accepted; unsupported providers raise ValueError."""
        for valid_provider in ["copilot", "ollama", "mock"]:
            s = Settings(debug=True, llm_provider=valid_provider)
            assert s.llm_provider == valid_provider

        with pytest.raises(ValueError) as exc_info:
            Settings(debug=True, llm_provider="unsupported_vendor")
        assert "Invalid LLM provider 'unsupported_vendor'" in str(exc_info.value)

    def test_database_and_redis_tls_configuration(self):
        """Verify database and redis TLS connection parameters are properly recognized."""
        s = Settings(
            debug=False,
            jwt_secret="a" * 32,
            database_url="postgresql+psycopg://app_user:strong_password@db.prod.internal:5432/legal_compliance_db?sslmode=require",
            redis_url="rediss://:redis_secret@cache.prod.internal:6379/0",
        )
        assert "sslmode=require" in s.database_url
        assert s.redis_url.startswith("rediss://")
