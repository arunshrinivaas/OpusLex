"""
Pydantic Schemas for AI Assistant Interaction, Preferences, Actions, and Auditing.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field


class AssistantPreferencesResponse(BaseModel):
    enabled: bool = True
    permission_level: int = Field(default=1, ge=1, le=4)
    voice_enabled: bool = False
    voice_name: str | None = None
    speech_rate: float = Field(default=1.0, ge=0.5, le=2.0)
    activation_shortcut: str = "Alt+A"
    context_sharing_enabled: bool = True
    history_retention_days: int = Field(default=30, ge=1, le=365)

    model_config = {"from_attributes": True}


class AssistantPreferencesUpdate(BaseModel):
    enabled: bool | None = None
    permission_level: int | None = Field(default=None, ge=1, le=4)
    voice_enabled: bool | None = None
    voice_name: str | None = None
    speech_rate: float | None = Field(default=None, ge=0.5, le=2.0)
    activation_shortcut: str | None = None
    context_sharing_enabled: bool | None = None
    history_retention_days: int | None = Field(default=None, ge=1, le=365)


class ApplicationContextSchema(BaseModel):
    active_section: str = "home"
    current_workspace: str | None = None
    investigation_id: int | None = None
    document_ids: list[int] | None = None
    selected_text: str | None = None


class AssistantActionSchema(BaseModel):
    id: str
    type: Literal[
        "navigate",
        "query_research",
        "investigation_query",
        "explain_page",
        "run_compliance_agent",
        "create_investigation",
        "update_investigation",
        "archive_investigation",
        "delete_investigation",
        "add_comment",
        "prohibited_action",
        "get_latest_investigation",
        "prepare_evidence_report",
        "general_calculation",
        "general_knowledge",
        "identity",
        "document_overview",
        "help_faq",
    ]
    title: str
    description: str
    payload: dict[str, Any]
    requires_approval: bool
    risk_level: Literal["low", "medium", "high"]
    permission_level_required: int = Field(ge=1, le=4)
    confirmation_token: str | None = None
    token_expires_at: datetime | None = None


class AssistantInteractionRequest(BaseModel):
    message: str = Field(min_length=1)
    conversation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    context: ApplicationContextSchema | dict[str, Any] | None = None
    confirmed_action_id: str | None = None


class AssistantInteractionResponse(BaseModel):
    conversation_id: str
    response_text: str
    status: Literal["success", "action_pending", "suggested", "denied", "error", "clarification_needed"]
    action: AssistantActionSchema | None = None
    audit_log_id: int | None = None
    sources: list[dict[str, Any]] | None = None

    @property
    def action_type(self) -> str | None:
        return self.action.type if self.action else None

    @property
    def action_status(self) -> str:
        if self.status in ("denied", "error"):
            return "failed"
        return self.status

    @property
    def message(self) -> str:
        return self.response_text

    def __await__(self):
        async def _resolve():
            return self
        return _resolve().__await__()


class AssistantActionConfirmRequest(BaseModel):
    conversation_id: str
    action_id: str
    action_type: str
    payload: dict[str, Any]
    confirmed: bool
    confirmation_token: str | None = None


class AssistantAuditLogResponse(BaseModel):
    id: int
    conversation_id: str
    action_type: str
    permission_level_required: int
    status: str
    parameters: str | None = None
    result_summary: str | None = None
    duration_ms: float | None = None
    previous_hash: str | None = None
    record_hash: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AssistantMessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender: Literal["user", "assistant"]
    content: str
    status: str
    action_type: str | None = None
    action_payload: str | None = None
    confirmation_token: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AssistantConversationResponse(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0

    model_config = {"from_attributes": True}
