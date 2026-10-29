"""
Authentication router — register, login, logout, /me endpoint.
Implements JWT-based authentication with RBAC roles, TOTP 2FA, and Google Sign-In.
"""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
import time
import secrets
import httpx
import pyotp
from twilio.rest import Client as TwilioClient
from twilio.base.exceptions import TwilioRestException
from fastapi import Request
import google.auth.transport
from google.oauth2 import id_token as google_id_token
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.auth import (
    Disable2FARequest,
    Enable2FARequest,
    GoogleAuthRequest,
    AppleAuthRequest,
    PhoneSendRequest,
    PhoneVerifyRequest,
    MFALoginRequest,
    MFAStatusResponse,
    PasswordChangeRequest,
    Setup2FAResponse,
    UserCreate,
    UserLogin,
    EmailSendRequest,
    EmailVerifyRequest,
    EmailAccountVerifyRequest,
    ProfileUpdateRequest,
)
from app.security import (
    create_access_token,
    create_mfa_challenge_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.utils.phone import normalize_phone_number
from app.services.email_service import EmailService


class HttpxResponse(google.auth.transport.Response):
    def __init__(self, response: httpx.Response):
        self._response = response

    @property
    def status(self):
        return self._response.status_code

    @property
    def headers(self):
        return self._response.headers

    @property
    def data(self):
        return self._response.content


class HttpxRequest(google.auth.transport.Request):
    def __init__(self):
        self.client = httpx.Client()

    def __call__(self, url, method="GET", body=None, headers=None, timeout=None, **kwargs):
        response = self.client.request(
            method, url, content=body, headers=headers, timeout=timeout
        )
        return HttpxResponse(response)


router = APIRouter(
    prefix="/api/v1/auth",
    tags=["Authentication"],
)

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Explicitly reject temporary MFA challenge tokens from accessing normal protected endpoints
    if payload.get("type") == "mfa_challenge":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="MFA challenge token cannot be used for direct API access",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: int | str | None = payload.get("sub")

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    user = (
        db.query(User)
        .filter(User.id == int(user_id))
        .first()
    )

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User | None:
    """Returns authenticated User if valid token present, else None without raising 401."""
    if credentials is None:
        return None
    try:
        payload = decode_access_token(credentials.credentials)
        if payload is None or payload.get("type") == "mfa_challenge":
            return None
        user_id = payload.get("sub")
        if user_id is None:
            return None
        return db.query(User).filter(User.id == int(user_id)).first()
    except Exception:
        return None


def require_roles(*roles: str):
    """Factory for role-checking dependencies."""

    def _check(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {', '.join(roles)}",
            )

        return current_user

    return _check


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
)
def register(
    user: UserCreate,
    db: Session = Depends(get_db),
):
    existing = (
        db.query(User)
        .filter(User.email == user.email)
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    db_user = User(
        email=user.email,
        password_hash=hash_password(user.password),
        full_name=user.full_name,
        role=getattr(user, "role", "viewer"),
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    return {
        "message": "User registered successfully",
        "id": db_user.id,
        "email": db_user.email,
        "full_name": db_user.full_name,
        "role": db_user.role,
    }


@router.post("/login")
def login(
    user: UserLogin,
    db: Session = Depends(get_db),
):
    db_user = (
        db.query(User)
        .filter(User.email == user.email)
        .first()
    )

    if not db_user or not db_user.password_hash or not verify_password(
        user.password,
        db_user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not db_user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Account is disabled",
        )

    # If 2FA is enabled, issue a temporary MFA challenge token instead of full access token
    if db_user.mfa_enabled:
        mfa_token = create_mfa_challenge_token(
            user_id=db_user.id,
            email=db_user.email,
            expires_delta=timedelta(minutes=5),
        )
        return {
            "mfa_required": True,
            "mfa_token": mfa_token,
        }

    access_token = create_access_token(
        data={
            "sub": str(db_user.id),
            "email": db_user.email,
            "role": db_user.role,
        },
        expires_delta=timedelta(
            minutes=settings.jwt_access_token_expire_minutes
        ),
    )

    return {
        "mfa_required": False,
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": db_user.id,
            "email": db_user.email,
            "full_name": db_user.full_name,
            "role": db_user.role,
            "mfa_enabled": db_user.mfa_enabled,
        },
    }


@router.post("/login/mfa")
def login_mfa(
    payload: MFALoginRequest,
    db: Session = Depends(get_db),
):
    token_payload = decode_access_token(payload.mfa_token)
    if token_payload is None or token_payload.get("type") != "mfa_challenge":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired MFA session. Please log in again.",
        )

    user_id = token_payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid MFA session.",
        )

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
        )

    if not user.mfa_enabled or not user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is not active for this account.",
        )

    code = payload.code.strip()
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authentication code must be a 6-digit number.",
        )

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid authentication code. Please try again.",
        )

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
        },
        expires_delta=timedelta(
            minutes=settings.jwt_access_token_expire_minutes
        ),
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "mfa_enabled": user.mfa_enabled,
        },
    }


@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user),
):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "mfa_enabled": current_user.mfa_enabled,
        "has_password": bool(current_user.password_hash),
        "google_linked": bool(current_user.google_id),
        "apple_linked": bool(current_user.apple_id),
        "phone_linked": bool(current_user.phone_number),
        "email_verified": current_user.email_verified,
    }


@router.post("/2fa/setup", response_model=Setup2FAResponse)
def setup_2fa(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Generate a secure random base32 secret for TOTP
    secret = pyotp.random_base32()
    current_user.totp_secret = secret
    db.commit()

    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(
        name=current_user.email,
        issuer_name="OpusLex",
    )

    return {
        "secret": secret,
        "provisioning_uri": provisioning_uri,
    }


@router.post("/2fa/enable")
def enable_2fa(
    payload: Enable2FARequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA setup has not been initiated. Please start setup first.",
        )

    code = payload.code.strip()
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authentication code must be a 6-digit number.",
        )

    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code. Please check the code in your authenticator app.",
        )

    current_user.mfa_enabled = True
    db.commit()

    return {
        "message": "Two-factor authentication enabled successfully",
        "mfa_enabled": True,
    }


@router.post("/2fa/disable")
def disable_2fa(
    payload: Disable2FARequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.mfa_enabled or not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is not enabled on this account.",
        )

    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password.",
        )

    code = payload.code.strip()
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authentication code must be a 6-digit number.",
        )

    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid authentication code.",
        )

    current_user.mfa_enabled = False
    current_user.totp_secret = None
    db.commit()

    return {
        "message": "Two-factor authentication disabled successfully",
        "mfa_enabled": False,
    }


@router.get("/2fa/status", response_model=MFAStatusResponse)
def status_2fa(
    current_user: User = Depends(get_current_user),
):
    return {
        "mfa_enabled": current_user.mfa_enabled,
    }


@router.post("/change-password")
def change_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password",
        )

    if payload.new_password == payload.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password",
        )

    current_user.password_hash = hash_password(payload.new_password)
    db.commit()

    return {
        "message": "Password changed successfully"
    }


@router.put("/profile")
def update_profile(
    payload: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trimmed_name = payload.full_name.strip()
    if not trimmed_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Full name cannot be blank",
        )
    current_user.full_name = trimmed_name
    db.commit()
    db.refresh(current_user)

    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "mfa_enabled": current_user.mfa_enabled,
        "has_password": bool(current_user.password_hash),
        "google_linked": bool(current_user.google_id),
        "apple_linked": bool(current_user.apple_id),
        "phone_linked": bool(current_user.phone_number),
        "email_verified": current_user.email_verified,
        "message": "Profile updated successfully",
    }


@router.post("/logout")
def logout():
    # JWT is stateless; client must discard the token.
    # For server-side invalidation, add a token blocklist (Redis).
    return {
        "message": "Logged out successfully"
    }

@router.post("/google")
def google_sign_in(
    payload: GoogleAuthRequest,
    db: Session = Depends(get_db),
):
    """
    Validate a Google ID token issued by Google Identity Services.
    Find or create an OpusLex user, then issue an access token (or MFA
    challenge if the account has TOTP enabled).
    """
    google_client_id = settings.google_client_id
    if not google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Sign-In is not configured on this server.",
        )

    # --- Validate the Google ID token server-side ---
    try:
        id_info = google_id_token.verify_oauth2_token(
            payload.id_token,
            HttpxRequest(),
            google_client_id,
            clock_skew_in_seconds=10,
        )
    except ValueError:
        # Covers: malformed token, expired, wrong audience, wrong issuer,
        # invalid signature. Do NOT surface token internals.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google authentication failed. Please try again.",
        )

    # Reject unverified Google email addresses
    if not id_info.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email is not verified.",
        )

    google_sub: str = id_info["sub"]           # Stable Google user ID
    verified_email: str = id_info["email"].lower().strip()
    display_name: str | None = id_info.get("name")

    # --- Find or create the OpusLex user ---
    # Priority 1: match by google_id (returning Google user)
    user = db.query(User).filter(User.google_id == google_sub).first()

    if user is None:
        # Priority 2: match by email (existing email/password account)
        user = db.query(User).filter(User.email == verified_email).first()

        if user is not None:
            # Existing account with same email — link Google identity
            if user.google_id is not None and user.google_id != google_sub:
                # Account already linked to a DIFFERENT Google identity
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This email is already linked to a different Google account.",
                )
            user.google_id = google_sub
            user.email_verified = True
            if not user.full_name and display_name:
                user.full_name = display_name
            db.commit()
            db.refresh(user)
        else:
            # Brand-new user — create OpusLex account
            user = User(
                email=verified_email,
                password_hash=None,      # Google-only; no local password
                full_name=display_name,
                role="viewer",
                is_active=True,
                google_id=google_sub,
                email_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled.",
        )

    # --- Issue token (or MFA challenge) ---
    if user.mfa_enabled:
        mfa_token = create_mfa_challenge_token(
            user_id=user.id,
            email=user.email,
            expires_delta=timedelta(minutes=5),
        )
        return {
            "mfa_required": True,
            "mfa_token": mfa_token,
        }

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
        },
        expires_delta=timedelta(minutes=settings.jwt_access_token_expire_minutes),
    )

    return {
        "mfa_required": False,
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "mfa_enabled": user.mfa_enabled,
        },
    }

@router.post("/apple")
def apple_sign_in(
    payload: AppleAuthRequest,
    db: Session = Depends(get_db),
):
    apple_client_id = settings.apple_client_id
    if not apple_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Apple Sign-In is not configured on this server.",
        )

    jwks_client = jwt.PyJWKClient("https://appleid.apple.com/auth/keys")
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(payload.id_token)
        id_info = jwt.decode(
            payload.id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=apple_client_id,
            issuer="https://appleid.apple.com",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Apple authentication failed. Please try again.",
        )

    apple_sub: str = id_info.get("sub")
    verified_email: str = id_info.get("email", "").lower().strip()

    if not apple_sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Apple authentication failed: missing subject.",
        )

    user = db.query(User).filter(User.apple_id == apple_sub).first()

    if user is None:
        if verified_email:
            user = db.query(User).filter(User.email == verified_email).first()

        if user is not None:
            if user.apple_id is not None and user.apple_id != apple_sub:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This email is already linked to a different Apple account.",
                )
            user.apple_id = apple_sub
            if not user.full_name and (payload.first_name or payload.last_name):
                user.full_name = f"{payload.first_name or ''} {payload.last_name or ''}".strip()
            db.commit()
            db.refresh(user)
        else:
            if not verified_email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Apple authentication failed: no email provided.",
                )
            user = User(
                email=verified_email,
                password_hash=None,
                full_name=f"{payload.first_name or ''} {payload.last_name or ''}".strip() or None,
                role="viewer",
                is_active=True,
                apple_id=apple_sub,
                email_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled.",
        )

    if user.mfa_enabled:
        mfa_token = create_mfa_challenge_token(
            user_id=user.id,
            email=user.email,
            expires_delta=timedelta(minutes=5),
        )
        return {
            "mfa_required": True,
            "mfa_token": mfa_token,
        }

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
        },
        expires_delta=timedelta(minutes=settings.jwt_access_token_expire_minutes),
    )

    return {
        "mfa_required": False,
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "mfa_enabled": user.mfa_enabled,
        },
    }

# Rate limiting data structures
_phone_send_timestamps: dict[str, list[float]] = {}
_ip_send_timestamps: dict[str, list[float]] = {}

def check_rate_limits(phone_number: str, ip_address: str):
    now = time.time()
    window = 15 * 60  # 15 minutes

    # Clean up old timestamps
    _phone_send_timestamps[phone_number] = [t for t in _phone_send_timestamps.get(phone_number, []) if now - t < window]
    _ip_send_timestamps[ip_address] = [t for t in _ip_send_timestamps.get(ip_address, []) if now - t < window]

    if len(_phone_send_timestamps[phone_number]) >= 3:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification requests for this phone number. Please try again later."
        )

    if len(_ip_send_timestamps[ip_address]) >= 10:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification requests from this IP address. Please try again later."
        )

    _phone_send_timestamps[phone_number].append(now)
    _ip_send_timestamps[ip_address].append(now)

@router.post("/phone/send")
def phone_send(
    payload: PhoneSendRequest,
    request: Request,
):
    try:
        normalized_phone = normalize_phone_number(payload.phone_number)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    ip_address = request.client.host if request.client else "unknown"
    check_rate_limits(normalized_phone, ip_address)

    account_sid = settings.twilio_account_sid
    auth_token = settings.twilio_auth_token
    verify_sid = settings.twilio_verify_service_sid

    if not account_sid or not auth_token or not verify_sid:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Phone authentication is not configured on this server."
        )

    client = TwilioClient(account_sid, auth_token)
    try:
        client.verify.v2.services(verify_sid).verifications.create(
            to=normalized_phone, channel="sms"
        )
    except TwilioRestException:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send verification code via SMS provider."
        )

    return {"message": "Verification code requested."}

@router.post("/phone/verify")
def phone_verify(
    payload: PhoneVerifyRequest,
    db: Session = Depends(get_db),
):
    try:
        normalized_phone = normalize_phone_number(payload.phone_number)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    account_sid = settings.twilio_account_sid
    auth_token = settings.twilio_auth_token
    verify_sid = settings.twilio_verify_service_sid

    if not account_sid or not auth_token or not verify_sid:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Phone authentication is not configured on this server."
        )

    client = TwilioClient(account_sid, auth_token)
    try:
        verification_check = client.verify.v2.services(verify_sid).verification_checks.create(
            to=normalized_phone, code=payload.code
        )
    except TwilioRestException as e:
        if e.status == 404:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired verification code."
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to verify code via SMS provider."
        )

    if verification_check.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification code."
        )

    # Verify success. Find or create user
    user = db.query(User).filter(User.phone_number == normalized_phone).first()

    if user is None:
        user = User(
            email=None,
            password_hash=None,
            full_name=None,
            role="viewer",
            is_active=True,
            phone_number=normalized_phone,
            email_verified=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled.",
        )

    if user.mfa_enabled:
        mfa_token = create_mfa_challenge_token(
            user_id=user.id,
            email=user.email or "",
            expires_delta=timedelta(minutes=5),
        )
        return {
            "mfa_required": True,
            "mfa_token": mfa_token,
        }

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email or "",
            "role": user.role,
        },
        expires_delta=timedelta(minutes=settings.jwt_access_token_expire_minutes),
    )

    return {
        "mfa_required": False,
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "mfa_enabled": user.mfa_enabled,
        },
    }

@router.post("/phone/link/send")
def phone_link_send(
    payload: PhoneSendRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        normalized_phone = normalize_phone_number(payload.phone_number)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    existing_user = db.query(User).filter(User.phone_number == normalized_phone).first()
    if existing_user and existing_user.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Phone number is already linked to another account."
        )

    ip_address = request.client.host if request.client else "unknown"
    check_rate_limits(normalized_phone, ip_address)

    account_sid = settings.twilio_account_sid
    auth_token = settings.twilio_auth_token
    verify_sid = settings.twilio_verify_service_sid

    if not account_sid or not auth_token or not verify_sid:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Phone authentication is not configured on this server."
        )

    client = TwilioClient(account_sid, auth_token)
    try:
        client.verify.v2.services(verify_sid).verifications.create(
            to=normalized_phone, channel="sms"
        )
    except TwilioRestException:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send verification code via SMS provider."
        )

    return {"message": "Verification code requested."}

@router.post("/phone/link/verify")
def phone_link_verify(
    payload: PhoneVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        normalized_phone = normalize_phone_number(payload.phone_number)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    existing_user = db.query(User).filter(User.phone_number == normalized_phone).first()
    if existing_user and existing_user.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Phone number is already linked to another account."
        )

    if current_user.phone_number == normalized_phone:
        return {"message": "Phone number successfully linked.", "phone_number": normalized_phone}

    account_sid = settings.twilio_account_sid
    auth_token = settings.twilio_auth_token
    verify_sid = settings.twilio_verify_service_sid

    if not account_sid or not auth_token or not verify_sid:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Phone authentication is not configured on this server."
        )

    client = TwilioClient(account_sid, auth_token)
    try:
        verification_check = client.verify.v2.services(verify_sid).verification_checks.create(
            to=normalized_phone, code=payload.code
        )
    except TwilioRestException as e:
        if e.status == 404:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired verification code."
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to verify code via SMS provider."
        )

    if verification_check.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification code."
        )

    current_user.phone_number = normalized_phone
    db.commit()

    return {"message": "Phone number successfully linked.", "phone_number": normalized_phone}

# Email OTP State & Rate Limiting
_email_otp_state: dict[str, dict] = {}
_email_send_timestamps: dict[str, list[float]] = {}

def check_email_rate_limits(email: str, ip_address: str):
    now = time.time()
    window = 15 * 60

    _email_send_timestamps[email] = [t for t in _email_send_timestamps.get(email, []) if now - t < window]
    _ip_send_timestamps[ip_address] = [t for t in _ip_send_timestamps.get(ip_address, []) if now - t < window]

    if len(_email_send_timestamps[email]) >= 3:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification requests for this email. Please try again later."
        )

    if len(_ip_send_timestamps[ip_address]) >= 10:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification requests from this IP address. Please try again later."
        )

    _email_send_timestamps[email].append(now)
    _ip_send_timestamps[ip_address].append(now)

def cleanup_email_otps():
    now = time.time()
    expired = [k for k, v in _email_otp_state.items() if v["expires_at"] < now]
    for k in expired:
        del _email_otp_state[k]

@router.post("/email-otp/send")
async def email_otp_send(
    payload: EmailSendRequest,
    request: Request,
):
    normalized_email = payload.email.lower().strip()
    ip_address = request.client.host if request.client else "unknown"

    check_email_rate_limits(normalized_email, ip_address)
    cleanup_email_otps()

    code = f"{secrets.randbelow(1000000):06d}"

    _email_otp_state[normalized_email] = {
        "code": code,
        "expires_at": time.time() + 300,
        "attempts": 0
    }

    try:
        await EmailService.send_otp(normalized_email, code)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email authentication is not configured on this server."
        )
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send verification code via email provider."
        )

    return {"message": "Verification code requested."}

@router.post("/email-otp/verify")
def email_otp_verify(
    payload: EmailVerifyRequest,
    db: Session = Depends(get_db),
):
    normalized_email = payload.email.lower().strip()
    cleanup_email_otps()

    otp_data = _email_otp_state.get(normalized_email)

    if not otp_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification code."
        )

    # Constant-time comparison
    if not secrets.compare_digest(otp_data["code"], payload.code):
        otp_data["attempts"] += 1
        if otp_data["attempts"] >= 3:
            del _email_otp_state[normalized_email]
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification code."
        )

    del _email_otp_state[normalized_email]

    user = db.query(User).filter(User.email == normalized_email).first()

    if user is None:
        user = User(
            email=normalized_email,
            password_hash=None,
            full_name=None,
            role="viewer",
            is_active=True,
            email_verified=True,
            phone_number=None,
            google_id=None,
            apple_id=None
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if not user.email_verified:
            user.email_verified = True
            db.commit()

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled.",
        )

    if user.mfa_enabled:
        mfa_token = create_mfa_challenge_token(
            user_id=user.id,
            email=user.email or "",
            expires_delta=timedelta(minutes=5),
        )
        return {
            "mfa_required": True,
            "mfa_token": mfa_token,
        }

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email or "",
            "role": user.role,
        },
        expires_delta=timedelta(minutes=settings.jwt_access_token_expire_minutes),
    )

    return {
        "mfa_required": False,
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "mfa_enabled": user.mfa_enabled,
        },
    }


@router.post("/email-otp/verify-account/send")
async def email_account_verify_send(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    if not current_user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No email associated with this account.",
        )
    if current_user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already verified.",
        )

    normalized_email = current_user.email.lower().strip()
    ip_address = request.client.host if request.client else "unknown"

    check_email_rate_limits(normalized_email, ip_address)
    cleanup_email_otps()

    code = f"{secrets.randbelow(1000000):06d}"

    _email_otp_state[normalized_email] = {
        "code": code,
        "expires_at": time.time() + 300,
        "attempts": 0
    }

    try:
        await EmailService.send_otp(normalized_email, code)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email authentication is not configured on this server."
        )
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send verification code via email provider."
        )

    return {"message": "Verification code sent."}


@router.post("/email-otp/verify-account/verify")
def email_account_verify_verify(
    payload: EmailAccountVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No email associated with this account.",
        )
    if current_user.email_verified:
        return {"message": "Email is already verified."}

    normalized_email = current_user.email.lower().strip()
    cleanup_email_otps()

    otp_data = _email_otp_state.get(normalized_email)

    if not otp_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification code."
        )

    # Constant-time comparison
    if not secrets.compare_digest(otp_data["code"], payload.code):
        otp_data["attempts"] += 1
        if otp_data["attempts"] >= 3:
            del _email_otp_state[normalized_email]
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification code."
        )

    del _email_otp_state[normalized_email]

    current_user.email_verified = True
    db.commit()

    return {"message": "Email verified successfully."}
