from pydantic import BaseModel, EmailStr, Field

VALID_ROLES = ["admin", "legal_analyst", "compliance_officer", "risk_analyst", "auditor", "viewer"]


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None
    role: str = "viewer"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str | None
    role: str
    is_active: bool
    mfa_enabled: bool = False

    class Config:
        from_attributes = True


class Setup2FAResponse(BaseModel):
    secret: str
    provisioning_uri: str


class Enable2FARequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class Disable2FARequest(BaseModel):
    password: str = Field(min_length=1)
    code: str = Field(min_length=6, max_length=6)


class MFALoginRequest(BaseModel):
    mfa_token: str = Field(min_length=1)
    code: str = Field(min_length=6, max_length=6)


class MFAStatusResponse(BaseModel):
    mfa_enabled: bool


class GoogleAuthRequest(BaseModel):
    """
    Receives the Google ID token returned by Google Identity Services.
    The backend validates this token server-side; no other identity
    fields are accepted from the frontend.
    """
    id_token: str = Field(min_length=1)


class AppleAuthRequest(BaseModel):
    """
    Receives the Apple ID token returned by Sign in with Apple JS.
    """
    id_token: str = Field(min_length=1)
    first_name: str | None = None
    last_name: str | None = None


class PhoneSendRequest(BaseModel):
    """
    Receives the phone number to start OTP verification.
    """
    phone_number: str = Field(min_length=1)


class PhoneVerifyRequest(BaseModel):
    """
    Receives the phone number and OTP code for verification.
    """
    phone_number: str = Field(min_length=1)
    code: str = Field(min_length=4, max_length=10)


class EmailSendRequest(BaseModel):
    email: EmailStr


class EmailVerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class EmailAccountVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class ProfileUpdateRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
