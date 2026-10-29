"""
Assistant Preferences and Audit Log SQLAlchemy Models.

Persists user-specific AI assistant permission levels (Levels 1-4), voice preferences,
activation shortcuts, and tamper-evident audit trails for all executed or attempted actions.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class AssistantPreference(Base):
    __tablename__ = "assistant_preferences"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Permission Levels:
    # 1: Read & Answer (no mutations)
    # 2: Suggest (prepares drafts, no mutations)
    # 3: Execute with Approval (explicit confirmation required)
    # 4: Limited Autonomy (low-risk auto-execute, high-risk requires approval)
    permission_level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    voice_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    voice_name: Mapped[str | None] = mapped_column(String(100), nullable=True, default=None)
    speech_rate: Mapped[float] = mapped_column(default=1.0, nullable=False)
    activation_shortcut: Mapped[str] = mapped_column(String(50), default="Alt+A", nullable=False)
    context_sharing_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    history_retention_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class AssistantAuditLog(Base):
    __tablename__ = "assistant_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    conversation_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    permission_level_required: Mapped[int] = mapped_column(Integer, nullable=False)
    # status: "executed" | "suggested" | "pending_approval" | "rejected" | "denied" | "failed" | "security_flag"
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    parameters: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string of sanitized parameters
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[float | None] = mapped_column(nullable=True)
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    record_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )

    @property
    def outcome(self) -> str:
        if self.status in ("denied", "security_flag"):
            return "denied"
        return self.status


class AssistantActionToken(Base):
    """
    Expiring, single-use confirmation tokens bound to user, action, and payload hash.
    Guarantees replay prevention, non-repudiation, and prevents unauthorized parameter tampering.
    """
    __tablename__ = "assistant_action_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    conversation_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    action_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)  # Canonical JSON snapshot of parameters
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )


class AssistantConversation(Base):
    """
    User-isolated assistant conversation session for tracking dialogue continuity.
    """
    __tablename__ = "assistant_conversations"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), default="Compliance Inquiry", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class AssistantMessage(Base):
    """
    Persistent message history inside an assistant conversation.
    """
    __tablename__ = "assistant_messages"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("assistant_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="success", nullable=False)
    action_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    action_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmation_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )

