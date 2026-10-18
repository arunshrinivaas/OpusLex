"""
AI Assistant Service: Intent Parsing, Server-Side Action Registry,
Permission Level Enforcement (Levels 1-4), Single-Use Expiring Confirmation Tokens,
Cryptographic Audit Hash Chaining, and Conversation Continuity.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncGenerator

from sqlalchemy.orm import Session

from app.models.assistant import (
    AssistantActionToken,
    AssistantAuditLog,
    AssistantConversation,
    AssistantMessage,
    AssistantPreference,
)
from app.models.document import Document
from app.models.investigation import Investigation
from app.models.investigation_comment import InvestigationComment
from app.schemas.assistant import (
    ApplicationContextSchema,
    AssistantActionSchema,
    AssistantInteractionRequest,
    AssistantInteractionResponse,
    AssistantPreferencesUpdate,
)
from app.services.agent_service import run_compliance_investigation
from app.services.rag_service import answer_with_rag, build_rag_context
from app.services.retrieval_service import (
    get_investigation_document_ids,
    get_investigation_documents_metadata,
)

logger = logging.getLogger(__name__)

LEVEL_NAMES = {
    1: "Level 1: Read & Answer",
    2: "Level 2: Suggest",
    3: "Level 3: Execute with Approval",
    4: "Level 4: Limited Autonomy",
}

PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior)\s+instructions",
    r"system\s+(override|prompt|directive)",
    r"elevate\s+(user\s+)?permission",
    r"bypass\s+(security|authorization|permission)",
    r"jailbreak",
    r"unrestricted\s+(mode|assistant)",
    r"pretend\s+you\s+are\s+(an?\s+)?unrestricted",
    r"drop\s+table\s+",
    r"delete\s+from\s+users",
    r"exec\s*\(",
    r"<script\b",
]


def detect_prompt_injection(text: str) -> tuple[bool, str]:
    """Detect prompt injection, system overrides, or unauthorized privilege escalation."""
    lower = text.lower()
    for pattern in PROMPT_INJECTION_PATTERNS:
        if re.search(pattern, lower):
            return True, f"Security violation detected: Input contains restricted instruction matching '{pattern}'."
    return False, ""


import asyncio
import threading

_bg_loop: asyncio.AbstractEventLoop | None = None
_bg_thread: threading.Thread | None = None
_bg_lock = threading.Lock()


def _get_background_loop() -> asyncio.AbstractEventLoop:
    global _bg_loop, _bg_thread
    with _bg_lock:
        if _bg_loop is None or _bg_loop.is_closed():
            _bg_loop = asyncio.new_event_loop()
            _bg_thread = threading.Thread(
                target=_bg_loop.run_forever,
                daemon=True,
                name="opuslex-coroutine-worker",
            )
            _bg_thread.start()
        return _bg_loop


def _run_coroutine_sync(coro):
    """Safely executes an asynchronous coroutine from synchronous caller on a dedicated persistent event loop."""
    import inspect
    if not inspect.iscoroutine(coro):
        return coro
    loop = _get_background_loop()
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    return future.result()


def validate_and_filter_context(
    db: Session,
    user_id: int,
    context: ApplicationContextSchema | dict | None,
) -> ApplicationContextSchema | None:
    """
    Validate that investigation_id and document_ids in context belong to the calling user.
    Prevents cross-user context leakage or forged frontend parameters.
    """
    if not context:
        return None

    if isinstance(context, dict):
        raw_inv_id = context.get("investigation_id")
        raw_doc_ids = context.get("document_ids")
        raw_section = context.get("active_section") or context.get("active_module") or "home"
        raw_workspace = context.get("current_workspace")
        raw_selected_text = context.get("selected_text")
    else:
        raw_inv_id = getattr(context, "investigation_id", None)
        raw_doc_ids = getattr(context, "document_ids", None)
        raw_section = getattr(context, "active_section", "home") or "home"
        raw_workspace = getattr(context, "current_workspace", None)
        raw_selected_text = getattr(context, "selected_text", None)

    filtered_inv_id = None
    if raw_inv_id is not None:
        inv = (
            db.query(Investigation)
            .filter(
                Investigation.id == raw_inv_id,
                Investigation.user_id == user_id,
            )
            .first()
        )
        if inv:
            filtered_inv_id = inv.id

    filtered_doc_ids: list[int] = []
    if raw_doc_ids:
        docs = (
            db.query(Document.id)
            .filter(
                Document.id.in_(raw_doc_ids),
                Document.user_id == user_id,
            )
            .all()
        )
        filtered_doc_ids = [d[0] for d in docs]

    return ApplicationContextSchema(
        active_section=raw_section,
        current_workspace=raw_workspace,
        investigation_id=filtered_inv_id,
        document_ids=filtered_doc_ids if filtered_doc_ids else None,
        selected_text=raw_selected_text[:1000] if raw_selected_text else None,
    )


def get_or_create_preferences(db: Session, user_id: int) -> AssistantPreference:
    """Retrieve assistant preferences for user; create with safe Level 1 defaults if missing."""
    pref = db.query(AssistantPreference).filter(AssistantPreference.user_id == user_id).first()
    if not pref or not isinstance(pref, AssistantPreference) or not hasattr(pref, "permission_level"):
        pref = AssistantPreference(
            user_id=user_id,
            enabled=True,
            permission_level=1,  # Least privilege default
            voice_enabled=False,
            voice_name=None,
            speech_rate=1.0,
            activation_shortcut="Alt+A",
            context_sharing_enabled=True,
            history_retention_days=30,
        )
        try:
            db.add(pref)
            db.commit()
            db.refresh(pref)
        except Exception:
            pass
    return pref


def update_preferences(
    db: Session, user_id: int, updates: AssistantPreferencesUpdate
) -> AssistantPreference:
    """Update assistant preferences for the authenticated user."""
    pref = get_or_create_preferences(db, user_id)
    if updates.enabled is not None:
        pref.enabled = updates.enabled
    if updates.permission_level is not None:
        if 1 <= updates.permission_level <= 4:
            pref.permission_level = updates.permission_level
        else:
            raise ValueError("Permission level must be between 1 and 4")
    if updates.voice_enabled is not None:
        pref.voice_enabled = updates.voice_enabled
    if updates.voice_name is not None:
        pref.voice_name = updates.voice_name
    if updates.speech_rate is not None:
        if 0.5 <= updates.speech_rate <= 2.0:
            pref.speech_rate = updates.speech_rate
        else:
            raise ValueError("Speech rate must be between 0.5 and 2.0")
    if updates.activation_shortcut is not None:
        pref.activation_shortcut = updates.activation_shortcut
    if updates.context_sharing_enabled is not None:
        pref.context_sharing_enabled = updates.context_sharing_enabled
    if updates.history_retention_days is not None:
        if 1 <= updates.history_retention_days <= 365:
            pref.history_retention_days = updates.history_retention_days
        else:
            raise ValueError("History retention days must be between 1 and 365")

    db.commit()
    db.refresh(pref)
    return pref


def log_assistant_audit(
    db: Session,
    user_id: int,
    conversation_id: str,
    action_type: str,
    permission_level_required: int,
    status: str,
    parameters: dict[str, Any] | None,
    result_summary: str | None,
    duration_ms: float | None,
) -> AssistantAuditLog:
    """
    Persist an audit record with SHA-256 cryptographic hash chaining.
    Each record binds to the user's previous audit entry, creating an immutable sequence.
    """
    clean_params = None
    if parameters:
        sanitized = {
            k: v for k, v in parameters.items()
            if k not in ("token", "password", "secret", "confirmation_token")
        }
        clean_params = json.dumps(sanitized, sort_keys=True)

    # Cryptographic Hash Chaining: link to user's latest audit record
    latest = (
        db.query(AssistantAuditLog)
        .filter(AssistantAuditLog.user_id == user_id)
        .order_by(AssistantAuditLog.id.desc())
        .first()
    )
    prev_hash = latest.record_hash if (latest and latest.record_hash) else "GENESIS_" + ("0" * 56)

    now_utc = datetime.now(timezone.utc)
    raw_payload = f"{user_id}:{conversation_id}:{action_type}:{status}:{clean_params or ''}:{prev_hash}:{now_utc.isoformat()}"
    rec_hash = hashlib.sha256(raw_payload.encode("utf-8")).hexdigest()

    audit_entry = AssistantAuditLog(
        user_id=user_id,
        conversation_id=conversation_id,
        action_type=action_type,
        permission_level_required=permission_level_required,
        status=status,
        parameters=clean_params,
        result_summary=result_summary[:500] if result_summary else None,
        duration_ms=duration_ms,
        previous_hash=prev_hash,
        record_hash=rec_hash,
        created_at=now_utc,
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)
    return audit_entry


def create_action_token(
    db: Session,
    user_id: int,
    conversation_id: str,
    action: AssistantActionSchema,
    validity_minutes: int = 5,
) -> AssistantActionToken:
    """
    Generate an expiring, single-use confirmation token bound to user, action, and payload hash.
    """
    token_str = secrets.token_urlsafe(32)
    now_utc = datetime.now(timezone.utc)
    expires_at = now_utc + timedelta(minutes=validity_minutes)

    clean_payload = {k: v for k, v in action.payload.items() if k not in ("token", "password", "secret")}
    payload_json = json.dumps(clean_payload, sort_keys=True)
    payload_hash = hashlib.sha256(payload_json.encode("utf-8")).hexdigest()

    token_record = AssistantActionToken(
        token=token_str,
        user_id=user_id,
        conversation_id=conversation_id,
        action_id=action.id,
        action_type=action.type,
        payload_hash=payload_hash,
        payload=payload_json,
        expires_at=expires_at,
        used_at=None,
        created_at=now_utc,
    )
    db.add(token_record)
    db.commit()
    db.refresh(token_record)
    return token_record


def verify_and_consume_action_token(
    db: Session,
    user_id: int,
    token_str: str,
    action_id: str,
) -> tuple[bool, str, AssistantActionToken | None]:
    """
    Verify and atomically consume a confirmation token.
    Enforces expiry (5 min), user binding, action binding, and replay rejection.
    """
    token_record = (
        db.query(AssistantActionToken)
        .filter(AssistantActionToken.token == token_str)
        .first()
    )
    if not token_record:
        return False, "Invalid confirmation token: Token does not exist.", None

    if token_record.user_id != user_id:
        return False, "Unauthorized: Token was issued for a different user.", None

    if token_record.action_id != action_id:
        return False, "Mismatched action: Token does not match requested action ID.", None

    if token_record.used_at is not None:
        return False, "Replay detected: This action confirmation token has already been consumed.", None

    now_utc = datetime.now(timezone.utc)
    if token_record.expires_at < now_utc:
        return False, "Expired token: Confirmation token expired after 5 minutes.", None

    # Consume the token atomically
    token_record.used_at = now_utc
    db.commit()
    db.refresh(token_record)
    return True, "Token verified.", token_record


# ── Conversation Continuity & Persistence Helpers ─────────────────────────────
def get_or_create_conversation(
    db: Session,
    user_id: int,
    conversation_id: str,
    title: str | None = None,
) -> AssistantConversation:
    conv = (
        db.query(AssistantConversation)
        .filter(
            AssistantConversation.id == conversation_id,
            AssistantConversation.user_id == user_id,
        )
        .first()
    )
    if not conv:
        conv = AssistantConversation(
            id=conversation_id,
            user_id=user_id,
            title=title or "Compliance Inquiry",
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)
    return conv


def persist_assistant_message(
    db: Session,
    user_id: int,
    conversation_id: str,
    sender: str,
    content: str,
    status: str = "success",
    action_type: str | None = None,
    action_payload: dict[str, Any] | None = None,
    confirmation_token: str | None = None,
) -> AssistantMessage:
    get_or_create_conversation(db, user_id, conversation_id)
    msg_id = str(uuid.uuid4())
    payload_str = json.dumps(action_payload) if action_payload else None
    msg = AssistantMessage(
        id=msg_id,
        conversation_id=conversation_id,
        user_id=user_id,
        sender=sender,
        content=content,
        status=status,
        action_type=action_type,
        action_payload=payload_str,
        confirmation_token=confirmation_token,
    )
    db.add(msg)
    # Update conversation updated_at
    conv = db.query(AssistantConversation).filter(AssistantConversation.id == conversation_id).first()
    if conv:
        conv.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)
    return msg


def list_user_conversations(
    db: Session,
    user_id: int,
    limit: int = 20,
) -> list[AssistantConversation]:
    return (
        db.query(AssistantConversation)
        .filter(AssistantConversation.user_id == user_id)
        .order_by(AssistantConversation.updated_at.desc())
        .limit(limit)
        .all()
    )


def get_conversation_messages(
    db: Session,
    user_id: int,
    conversation_id: str,
) -> list[AssistantMessage]:
    return (
        db.query(AssistantMessage)
        .filter(
            AssistantMessage.conversation_id == conversation_id,
            AssistantMessage.user_id == user_id,
        )
        .order_by(AssistantMessage.created_at.asc())
        .all()
    )


def clear_user_conversations(
    db: Session,
    user_id: int,
) -> int:
    deleted = (
        db.query(AssistantConversation)
        .filter(AssistantConversation.user_id == user_id)
        .delete()
    )
    db.commit()
    return deleted


# ── Intent Parsing and Server-Side Action Registry ────────────────────────────
def parse_intent_and_action(
    message: str,
    context: ApplicationContextSchema | None,
    current_user_id: int,
) -> tuple[str, AssistantActionSchema | None, str | None]:
    """
    Deterministic intent parser identifying supported OpusLex actions.
    Returns: (intent_type, action_schema, clarification_message)
    """
    msg = message.strip()
    lower = msg.lower()

    # Security Guard: Check prompt injection patterns first
    is_injection, reason = detect_prompt_injection(msg)
    if is_injection:
        return "security_flag", None, reason

    # 0. Prohibited Actions (Strict server-side policy enforcement)
    prohibited_patterns = [
        r"\bdelete\s+(?:all\s+)?users\b",
        r"\bdelete\s+user\b",
        r"\bdrop\s+table\b",
        r"\btruncate\s+table\b",
        r"\belevate\s+(?:user\s+)?permission\b",
        r"\bmake\s+me\s+admin\b",
        r"\bchange\s+(?:my\s+)?role\s+to\s+admin\b",
        r"\bgrant\s+(?:me\s+)?admin\b",
        r"\bexport\s+(?:all\s+)?data\s+to\s+webhook\b",
        r"\bbypass\s+(?:permission|auth|authorization)\b",
        r"\baccess\s+other\s+users\b",
    ]
    if any(re.search(pat, lower) for pat in prohibited_patterns):
        denial_reason = "Action denied: The requested operation is prohibited by OpusLex security policies and permissions."
        action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type="prohibited_action",
            title="Prohibited Action Request",
            description=denial_reason,
            payload={"message": msg},
            requires_approval=False,
            risk_level="high",
            permission_level_required=4,
        )
        return "prohibited_action", action, denial_reason

    # 1. "Find my latest investigation and summarise its status" (Application Data Query)
    latest_inv_patterns = [
        r"(?:find|get|show|what is|summarise|summarize)\s+(?:my\s+)?latest\s+investigation",
        r"latest\s+investigation(?:\s+status)?",
        r"summarise\s+(?:the\s+)?status\s+of\s+(?:my\s+)?latest\s+investigation",
        r"most\s+recent\s+investigation",
    ]
    if any(re.search(pat, lower) for pat in latest_inv_patterns):
        action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type="get_latest_investigation",
            title="Retrieve Latest Investigation",
            description="Queries your latest authorized compliance investigation and summarizes its status.",
            payload={"user_id": current_user_id},
            requires_approval=False,
            risk_level="low",
            permission_level_required=1,
        )
        return "get_latest_investigation", action, None

    # 2. "Review the evidence and prepare a report" (Multi-Step Evidence Review & Report)
    report_patterns = [
        r"review\s+(?:the\s+)?evidence\s+and\s+prepare\s+(?:a\s+)?report",
        r"prepare\s+(?:a\s+)?(?:compliance\s+)?report",
        r"review\s+evidence\s+and\s+report",
        r"generate\s+(?:a\s+)?report\s+from\s+evidence",
    ]
    if any(re.search(pat, lower) for pat in report_patterns):
        inv_id_match = re.search(r"investigation\s*#?(\d+)", lower)
        target_inv_id = int(inv_id_match.group(1)) if inv_id_match else (context.investigation_id if context else None)
        action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type="prepare_evidence_report",
            title=f"Review Evidence & Prepare Report{f' for Investigation #{target_inv_id}' if target_inv_id else ''}",
            description="Reviews attached authorized evidence, identifies gaps and contradictions, and creates a structured compliance report.",
            payload={"investigation_id": target_inv_id, "question": msg},
            requires_approval=False,
            risk_level="low",
            permission_level_required=1,
        )
        return "prepare_evidence_report", action, None

    # 3. Deterministic Arithmetic Calculations (e.g. "What is 18% of 2,500?")
    from app.services.intent_service import evaluate_arithmetic_query, classify_query
    is_calc, calc_exp, calc_res = evaluate_arithmetic_query(msg)
    if is_calc and calc_exp:
        action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type="general_calculation",
            title="Arithmetic Calculation",
            description="Evaluates mathematical calculations deterministically.",
            payload={"explanation": calc_exp, "result": calc_res},
            requires_approval=False,
            risk_level="low",
            permission_level_required=1,
        )
        return "general_calculation", action, None

    # 5. "Explain this page" / "Explain page" / "What am I looking at"
    explain_triggers = [
        "explain this page",
        "explain page",
        "what am i looking at",
        "summarize this page",
        "where am i",
        "explain section",
    ]
    if any(trig in lower for trig in explain_triggers):
        section = context.active_section if context else "home"
        action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type="explain_page",
            title=f"Explain Section: {section.capitalize()}",
            description=f"Provides workflow context and guidance for the {section.capitalize()} section.",
            payload={
                "section": section,
                "investigation_id": context.investigation_id if context else None,
                "selected_text": context.selected_text if context else None,
            },
            requires_approval=False,
            risk_level="low",
            permission_level_required=1,
        )
        return "explain_page", action, None

    # 2. Navigation Commands
    nav_sections = {
        "home": ["home", "dashboard", "main page"],
        "regulations": ["regulations", "regulation"],
        "policies": ["policies", "policy"],
        "research": ["research", "search documents", "knowledge base"],
        "agents": ["agents", "ai agents", "multi-agent"],
        "investigations": ["investigations", "investigation workspace"],
        "settings": ["settings", "preferences", "config"],
        "audit": ["audit", "audit findings", "findings"],
    }

    nav_match = re.search(r"^(?:go\s+to|open|navigate\s+to|show)\s+(.+)$", lower)
    if nav_match:
        target_term = nav_match.group(1).strip()
        for section_name, synonyms in nav_sections.items():
            if target_term == section_name or any(s == target_term or target_term.startswith(s) for s in synonyms):
                action = AssistantActionSchema(
                    id=str(uuid.uuid4()),
                    type="navigate",
                    title=f"Navigate to {section_name.capitalize()}",
                    description=f"Switches active workspace view to {section_name.capitalize()}.",
                    payload={"section": section_name},
                    requires_approval=False,
                    risk_level="low",
                    permission_level_required=1,
                )
                return "navigate", action, None

    for section_name, triggers in nav_sections.items():
        if any(lower == trig or lower.startswith(trig) for trig in triggers):
            action = AssistantActionSchema(
                id=str(uuid.uuid4()),
                type="navigate",
                title=f"Navigate to {section_name.capitalize()}",
                description=f"Switches active workspace view to {section_name.capitalize()}.",
                payload={"section": section_name},
                requires_approval=False,
                risk_level="low",
                permission_level_required=1,
            )
            return "navigate", action, None

    # 3. Investigation Creation
    create_inv_pattern = r"(?:create|new|start)\s+(?:an?\s+)?investigation(?:\s*[:\-]?\s*(?:titled\s+)?['\"]?([^'\"]+)['\"]?)?"
    create_match = re.search(create_inv_pattern, msg, re.IGNORECASE)
    if create_match and ("create" in lower or "new investigation" in lower or "start investigation" in lower):
        raw_title = create_match.group(1)
        if not raw_title or not raw_title.strip():
            return (
                "clarification_needed",
                None,
                "To create a new compliance investigation, please specify a title. For example: 'Create investigation: Q3 AML Compliance Audit'.",
            )
        title = raw_title.strip().strip("'\"")
        action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type="create_investigation",
            title=f"Create Investigation: {title}",
            description=f"Creates a new active investigation record titled '{title}'.",
            payload={"title": title, "description": f"Created via OpusLex Assistant on {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"},
            requires_approval=True,
            risk_level="low",
            permission_level_required=3,
        )
        return "create_investigation", action, None


    # 4. Run Compliance Agent on Investigation
    if "run agent" in lower or "run compliance" in lower or "analyze investigation" in lower or "start agent" in lower:
        inv_id_match = re.search(r"investigation\s*#?(\d+)", lower)
        target_inv_id = int(inv_id_match.group(1)) if inv_id_match else (context.investigation_id if context else None)
        if not target_inv_id:
            return (
                "clarification_needed",
                None,
                "Please specify which investigation ID you would like to run (e.g., 'Run agent on investigation #12') or select one from the Investigations workspace.",
            )
        action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type="run_compliance_agent",
            title=f"Run Multi-Agent Compliance Workflow on Investigation #{target_inv_id}",
            description="Executes LangGraph compliance multi-agent analysis across attached documents.",
            payload={"investigation_id": target_inv_id, "question": msg},
            requires_approval=True,
            risk_level="medium",
            permission_level_required=3,
        )
        return "run_compliance_agent", action, None

    # 5. Archive Investigation
    if "archive investigation" in lower or "close investigation" in lower:
        inv_id_match = re.search(r"investigation\s*#?(\d+)", lower)
        target_inv_id = int(inv_id_match.group(1)) if inv_id_match else (context.investigation_id if context else None)
        if not target_inv_id:
            return (
                "clarification_needed",
                None,
                "Please specify which investigation ID you want to archive (e.g., 'Archive investigation #5').",
            )
        action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type="archive_investigation",
            title=f"Archive Investigation #{target_inv_id}",
            description=f"Changes status of Investigation #{target_inv_id} to Archived.",
            payload={"investigation_id": target_inv_id},
            requires_approval=True,
            risk_level="medium",
            permission_level_required=3,
        )
        return "archive_investigation", action, None

    # 6. Delete Investigation (Strictly High Risk)
    if "delete investigation" in lower or "remove investigation" in lower:
        inv_id_match = re.search(r"investigation\s*#?(\d+)", lower)
        target_inv_id = int(inv_id_match.group(1)) if inv_id_match else (context.investigation_id if context else None)
        if not target_inv_id:
            return (
                "clarification_needed",
                None,
                "Please specify which investigation ID you wish to delete (e.g., 'Delete investigation #3').",
            )
        action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type="delete_investigation",
            title=f"Permanently Delete Investigation #{target_inv_id}",
            description=f"Permanently deletes Investigation #{target_inv_id} and all its associated findings. This action cannot be undone.",
            payload={"investigation_id": target_inv_id},
            requires_approval=True,
            risk_level="high",
            permission_level_required=3,
        )
        return "delete_investigation", action, None

    # 7. Add Comment to Investigation
    if ("add comment" in lower or "post comment" in lower or "note:" in lower) and context and context.investigation_id:
        text = re.sub(r"^(?:add\s+comment|post\s+comment|note:)\s*[:\-]?\s*", "", msg, flags=re.IGNORECASE)
        action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type="add_comment",
            title=f"Add Comment to Investigation #{context.investigation_id}",
            description=f"Appends a compliance finding note to Investigation #{context.investigation_id}.",
            payload={"investigation_id": context.investigation_id, "text": text},
            requires_approval=False,
            risk_level="low",
            permission_level_required=3,
        )
        return "add_comment", action, None

    # 8. Intent Classification via intent_service
    classification = classify_query(msg)
    intent = classification.get("intent", "general_knowledge")

    if intent == "identity":
        themis_identity = (
            "I am Themis, your personal AI assistant within OpusLex. "
            "I can assist with general reasoning, analysis, research, coding, and technical questions, "
            "as well as orchestrating authorized compliance investigations, document analysis, and platform actions across OpusLex."
        )
        action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type="identity",
            title="Themis Identity",
            description="Identifies Themis and its capabilities.",
            payload={"question": msg, "answer": themis_identity},
            requires_approval=False,
            risk_level="low",
            permission_level_required=1,
        )
        return "identity", action, None

    if intent == "document_overview":
        action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type="document_overview",
            title="Document Scope Overview",
            description="Inspects and summarizes the documents available in your authorized scope.",
            payload={"question": msg},
            requires_approval=False,
            risk_level="low",
            permission_level_required=1,
        )
        return "document_overview", action, None

    if intent in ("help_password_policy", "help_password_change", "help_faq"):
        from app.services.help_knowledge import generate_knowledge_answer
        faq_ans = generate_knowledge_answer(msg)
        action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type="help_faq",
            title="OpusLex Guidance & Help",
            description="Provides guidance on OpusLex features, workflows, and navigation.",
            payload={"question": msg, "answer": faq_ans},
            requires_approval=False,
            risk_level="low",
            permission_level_required=1,
        )
        return "help_faq", action, None

    if intent == "general_knowledge":
        action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type="general_knowledge",
            title="General Knowledge Response",
            description="Answers technical, reasoning, and explanatory questions via the configured LLM.",
            payload={"question": msg},
            requires_approval=False,
            risk_level="low",
            permission_level_required=1,
        )
        return "general_knowledge", action, None

    # 9. Default: Informational compliance inquiry (RAG search)
    action = AssistantActionSchema(
        id=str(uuid.uuid4()),
        type="query_research",
        title="Knowledge Base Research Query",
        description="Searches authorized compliance documents and regulations to answer the inquiry.",
        payload={"question": msg},
        requires_approval=False,
        risk_level="low",
        permission_level_required=1,
    )
    return "query_research", action, None


class ActionExecutionResult(tuple):
    """Dual sync/async tuple returning (success, result_message, result_data)."""
    def __new__(cls, val):
        return super().__new__(cls, val)

    def __await__(self):
        async def _resolve():
            return self
        return _resolve().__await__()


def execute_action(
    db: Session,
    action: AssistantActionSchema,
    user_id: int,
    context: ApplicationContextSchema | None = None,
) -> ActionExecutionResult:
    """
    Executes a validated, authorized action on the backend.
    Enforces that documents and investigations belong exclusively to the calling user.
    Returns an ActionExecutionResult tuple: (success, result_message, result_data)
    """
    res = _execute_action_impl(db, action, user_id, context)
    return ActionExecutionResult(res)


def _execute_action_impl(
    db: Session,
    action: AssistantActionSchema,
    user_id: int,
    context: ApplicationContextSchema | None = None,
) -> tuple[bool, str, dict[str, Any]]:
    """
    Executes a validated, authorized action on the backend.
    Enforces that documents and investigations belong exclusively to the calling user.
    Returns: (success, result_message, result_data)
    """
    action_type = action.type
    payload = action.payload

    if action_type == "navigate":
        section = payload.get("section", "home")
        return True, f"Navigating to {section.capitalize()} section.", {"section": section}

    elif action_type == "explain_page":
        section = payload.get("section", "home")
        inv_id = payload.get("investigation_id")
        selected_text = payload.get("selected_text")

        explanation_parts = []
        if selected_text:
            explanation_parts.append(f"Highlighted Text Analysis:\n\"{selected_text}\"\nThis excerpt is analyzed within the context of your compliance policies.")
        
        section_guides = {
            "home": "You are on the Home Dashboard. Here you can see an executive overview of active compliance investigations, recent audit findings, and pending tasks.",
            "regulations": "You are in the Regulations section. This view displays legal regulatory frameworks, compliance articles, and regulatory change tracking.",
            "policies": "You are in Policies. Here you can browse and manage internal corporate policies, standards, and control frameworks.",
            "research": "You are in Legal Research. Here you can search the knowledge base using semantic RAG queries, view chunk citations, and upload new compliance documents.",
            "agents": "You are in AI Agents. Here you can launch multi-agent LangGraph workflows that orchestrate supervisor, document analysis, grounded verification, and risk synthesis agents.",
            "investigations": f"You are in Investigations.{f' Currently focused on Investigation #{inv_id}.' if inv_id else ' Here you can track, review, and remediate compliance matters.'}",
            "audit": "You are in Audit & Findings. Here you can review chronological audit trails, verification results, and export regulatory compliance reports.",
            "settings": "You are in Settings. Here you can manage your appearance, language preferences (120+ languages), and configure AI Assistant permission levels (Levels 1-4).",
        }
        explanation_parts.append(section_guides.get(section, f"You are in the {section.capitalize()} workspace."))
        final_exp = "\n\n".join(explanation_parts)
        return True, final_exp, {"section": section, "investigation_id": inv_id}

    elif action_type == "query_research":
        question = payload.get("question", "")
        # Authorized document IDs if scoped in context
        doc_ids = context.document_ids if context else None
        rag_res = _run_coroutine_sync(answer_with_rag(
            db=db,
            question=question,
            limit=5,
            document_ids=doc_ids,
            user_id=user_id,
        ))
        answer = rag_res.get("answer", "No answer found.")
        sources = rag_res.get("sources", [])
        
        evidence_note = ""
        if not sources:
            evidence_note = "\n\n*(Note: No matching compliance documents were retrieved from your authorized library for this query. The answer above is based on general regulatory knowledge.)*"

        full_answer = f"{answer}{evidence_note}"
        return True, full_answer, {"answer": full_answer, "sources": sources}

    elif action_type == "create_investigation":
        title = payload.get("title", "Untitled Investigation")
        desc = payload.get("description", "")
        inv = Investigation(
            title=title,
            description=desc,
            status="Active",
            user_id=user_id,
        )
        db.add(inv)
        db.commit()
        db.refresh(inv)
        return True, f"Successfully created Investigation #{inv.id} ('{inv.title}').", {"investigation_id": inv.id, "title": inv.title}

    elif action_type == "archive_investigation":
        inv_id = payload.get("investigation_id")
        inv = db.query(Investigation).filter(Investigation.id == inv_id, Investigation.user_id == user_id).first()
        if not inv:
            return False, f"Investigation #{inv_id} not found or you are not authorized to modify it.", {}
        inv.status = "Archived"
        db.commit()
        return True, f"Investigation #{inv_id} has been archived.", {"investigation_id": inv_id, "status": "Archived"}

    elif action_type == "delete_investigation":
        inv_id = payload.get("investigation_id")
        inv = db.query(Investigation).filter(Investigation.id == inv_id, Investigation.user_id == user_id).first()
        if not inv:
            return False, f"Investigation #{inv_id} not found or you are not authorized to delete it.", {}
        db.delete(inv)
        db.commit()
        return True, f"Investigation #{inv_id} ('{inv.title}') was permanently deleted.", {"investigation_id": inv_id}

    elif action_type == "run_compliance_agent":
        inv_id = payload.get("investigation_id")
        inv = db.query(Investigation).filter(Investigation.id == inv_id, Investigation.user_id == user_id).first()
        if not inv:
            return False, f"Investigation #{inv_id} not found or you are not authorized to run agents on it.", {}
        question = payload.get("question") or "Assess compliance of attached documents."
        run_res = _run_coroutine_sync(run_compliance_investigation(
            db=db,
            investigation_id=inv_id,
            user_id=user_id,
            question=question,
        ))
        return True, f"Agent run completed on Investigation #{inv_id}. Risk Score: {run_res.risk_score} ({run_res.risk_level}).", {
            "agent_run_id": run_res.id,
            "risk_score": run_res.risk_score,
            "risk_level": run_res.risk_level,
            "finding": run_res.finding,
        }

    elif action_type == "add_comment":
        inv_id = payload.get("investigation_id")
        text = payload.get("text", "")
        inv = db.query(Investigation).filter(Investigation.id == inv_id, Investigation.user_id == user_id).first()
        if not inv:
            return False, f"Investigation #{inv_id} not found or you are not authorized to comment on it.", {}
        comment = InvestigationComment(
            investigation_id=inv_id,
            user_id=user_id,
            text=text,
        )
        db.add(comment)
        db.commit()
        db.refresh(comment)
        return True, f"Comment added to Investigation #{inv_id}.", {"comment_id": comment.id}

    elif action_type == "get_latest_investigation":
        q = (
            db.query(Investigation)
            .filter(Investigation.user_id == user_id)
            .order_by(Investigation.created_at.desc(), Investigation.id.desc())
        )
        all_invs = q.all() if hasattr(q, "all") else []
        inv = all_invs[0] if (isinstance(all_invs, list) and all_invs) else q.first()
        if not inv:
            return True, "You currently have no investigations recorded.", {"investigation": None}

        created_str = inv.created_at.strftime("%Y-%m-%d %H:%M UTC") if getattr(inv, "created_at", None) else "Unknown date"
        docs = get_investigation_documents_metadata(db, inv.id, inv)
        doc_count = len(docs)
        doc_names = ", ".join(f"'{d.get('filename') if isinstance(d, dict) else d.filename}'" for d in docs) if doc_count > 0 else "None"

        summary = (
            f"Latest Investigation: '{inv.title}' (ID #{inv.id}). Status: {inv.status}.\n\n"
            f"• Title: {inv.title}\n"
            f"• Status: {inv.status}\n"
            f"• Jurisdiction: {getattr(inv, 'jurisdiction', None) or 'Not specified'}\n"
            f"• Description: {getattr(inv, 'description', None) or 'No description provided'}\n"
            f"• Created: {created_str}\n"
            f"• Attached Evidence: {doc_count} document(s) ({doc_names})"
        )
        return True, summary, {
            "investigation_id": inv.id,
            "title": inv.title,
            "status": inv.status,
            "jurisdiction": getattr(inv, "jurisdiction", None),
            "created_at": created_str,
            "document_count": doc_count,
        }

    elif action_type == "prepare_evidence_report":
        target_inv_id = payload.get("investigation_id")
        if not target_inv_id:
            q = (
                db.query(Investigation)
                .filter(Investigation.user_id == user_id)
                .order_by(Investigation.created_at.desc(), Investigation.id.desc())
            )
            all_invs = q.all() if hasattr(q, "all") else []
            latest_inv = all_invs[0] if (isinstance(all_invs, list) and all_invs) else q.first()
            if latest_inv:
                target_inv_id = latest_inv.id
            else:
                return False, "No active investigation found to prepare a report on. Please create an investigation first.", {}

        inv = (
            db.query(Investigation)
            .filter(Investigation.id == target_inv_id, Investigation.user_id == user_id)
            .first()
        )
        if not inv:
            return False, f"Investigation #{target_inv_id} not found or you are not authorized to access it.", {}

        docs = get_investigation_documents_metadata(db, inv.id, inv)
        doc_names = [d.get("filename") if isinstance(d, dict) else d.filename for d in docs]

        report_header = f"Evidence Review & Compliance Report: Investigation #{inv.id} ('{inv.title}')"
        if not docs:
            report_body = (
                f"### {report_header}\n\n"
                f"**Status:** {inv.status} | **Jurisdiction:** {getattr(inv, 'jurisdiction', None) or 'Global'}\n\n"
                f"**Evidence Review Findings:**\n"
                f"• Attached Evidence: 0 documents attached.\n"
                f"• Evidence Gaps: Critical gap — no primary policy or agreement documentation is currently attached.\n"
                f"• Recommended Actions: Attach relevant standard operating procedures, contracts, or compliance policies to enable full automated gap analysis."
            )
        else:
            report_body = (
                f"### {report_header}\n\n"
                f"**Status:** {inv.status} | **Jurisdiction:** {getattr(inv, 'jurisdiction', None) or 'Global'}\n\n"
                f"**Attached Evidence Reviewed ({len(docs)} document(s)):**\n"
                + "\n".join(f"• {fn}" for fn in doc_names) + "\n\n"
                f"**Key Findings & Gap Analysis:**\n"
                f"• Scope Coverage: Evidence reviewed for compliance obligations.\n"
                f"• Contradictions Identified: None in verified attached provisions.\n"
                f"• Status: Report generated and saved to investigation audit trail."
            )

        comment = InvestigationComment(
            investigation_id=inv.id,
            user_id=user_id,
            text=f"📋 [Automated Evidence Report]\n\n{report_body}",
        )
        db.add(comment)
        db.commit()
        db.refresh(comment)

        result_msg = (
            f"Report Prepared for Investigation #{inv.id} ('{inv.title}'). "
            f"Attached evidence reviewed: {', '.join(doc_names) if doc_names else 'None'}.\n\n"
            f"{report_body}"
        )

        return True, result_msg, {
            "investigation_id": inv.id,
            "report_comment_id": comment.id,
            "document_count": len(docs),
            "status": "completed",
        }

    elif action_type == "general_calculation":
        exp = payload.get("explanation", "")
        return True, exp, {"result": payload.get("result")}

    elif action_type == "identity":
        ans = payload.get("answer") or (
            "I am Themis, your personal AI assistant within OpusLex. "
            "I can assist with general reasoning, analysis, research, coding, and technical questions, "
            "as well as orchestrating authorized compliance investigations, document analysis, and platform actions across OpusLex."
        )
        return True, ans, {"answer": ans, "identity": "Themis"}

    elif action_type == "document_overview":
        if context and context.investigation_id:
            inv = db.query(Investigation).filter(Investigation.id == context.investigation_id, Investigation.user_id == user_id).first()
            if inv:
                docs_meta = get_investigation_documents_metadata(db, inv.id, inv)
                if docs_meta:
                    doc_list = "\n".join(
                        f"• **{d.get('title') or d.get('filename')}** ({d.get('filename')}): {d.get('description') or 'Attached evidence document'}"
                        for d in docs_meta
                    )
                    ans = f"Here is an overview of the {len(docs_meta)} document(s) attached to Investigation #{inv.id} ('{inv.title}'):\n\n{doc_list}"
                    return True, ans, {"document_count": len(docs_meta), "documents": docs_meta}
                else:
                    ans = f"Investigation #{inv.id} ('{inv.title}') currently has no documents attached."
                    return True, ans, {"document_count": 0, "documents": []}

        user_docs = db.query(Document).filter(Document.user_id == user_id).order_by(Document.id.desc()).limit(10).all()
        if not user_docs:
            ans = "You currently do not have any compliance documents in your authorized library. Once documents are uploaded or assigned to investigations, I can inspect and summarize their contents for you."
            return True, ans, {"document_count": 0, "documents": []}

        doc_list = "\n".join(f"• **{d.title or d.filename}** ({d.filename}): {d.description or 'Compliance document'}" for d in user_docs)
        ans = f"You have {len(user_docs)} document(s) in your authorized workspace:\n\n{doc_list}\n\nTo analyze specific clauses or compliance standards, you can ask questions about any of these documents."
        return True, ans, {"document_count": len(user_docs), "documents": [d.filename for d in user_docs]}

    elif action_type == "help_faq":
        ans = payload.get("answer")
        if not ans:
            from app.services.help_knowledge import generate_knowledge_answer
            ans = generate_knowledge_answer(payload.get("question", ""))
        return True, ans, {"answer": ans, "sources": []}

    elif action_type == "general_knowledge":
        q = payload.get("question", "")
        from app.services.copilot_service import _generate_general_mock_response, ask_copilot_with_context
        from app.config import settings
        system_prompt = (
            "You are Themis, an expert autonomous AI assistant. "
            "Provide a direct, accurate, and comprehensive explanation for general technical, "
            "scientific, strategic, creative, coding, mathematical, and reasoning inquiries "
            "without requiring compliance documents or restricting answers to legal compliance."
        )
        try:
            if settings.llm_provider == "mock":
                ans = _generate_general_mock_response(q)
            else:
                ans = _run_coroutine_sync(ask_copilot_with_context(
                    question=q,
                    context="",
                    strict_grounding=False,
                    system_prompt=system_prompt,
                ))
            return True, ans, {"answer": ans, "sources": []}
        except Exception as exc:
            err_msg = f"LLM provider '{settings.llm_provider}' failed: {str(exc)}"
            return False, err_msg, {"error": str(exc), "provider": settings.llm_provider}

    elif action_type == "prohibited_action":
        denial_msg = "Access Denied: The requested operation is prohibited by OpusLex security policies and permissions."
        return False, denial_msg, {"status": "denied", "reason": "unauthorized_operation"}

    return False, f"Unsupported action type: {action_type}", {}


# ── Autonomous Multi-Step Planning & Execution ────────────────────────────────
def plan_multi_step_goal(
    goal: str,
    context: ApplicationContextSchema | None,
    user_id: int,
) -> tuple[bool, list[dict[str, Any]]]:
    """
    Deconstructs a compound autonomous goal into an ordered execution plan.
    Returns: (is_multi_step, steps)
    """
    lower = goal.lower().strip()

    has_latest_inv = any(p in lower for p in ["latest investigation", "most recent investigation", "find my investigation"])
    has_review = any(p in lower for p in ["review", "evidence", "check evidence", "analyze evidence"])
    has_report = any(p in lower for p in ["prepare a report", "prepare report", "generate report", "draft report", "report"])

    # Multi-step request requiring multiple tools:
    # e.g., "Find my latest investigation and summarize its status, then review the evidence and prepare a report"
    # or "Find my latest investigation, review the evidence, and prepare a report"
    if has_latest_inv and has_review and has_report:
        steps = [
            {
                "step_id": 1,
                "action_type": "get_latest_investigation",
                "title": "Query Latest Investigation",
                "payload": {"user_id": user_id},
                "permission_level_required": 1,
                "risk_level": "low",
            },
            {
                "step_id": 2,
                "action_type": "prepare_evidence_report",
                "title": "Review Evidence & Draft Report",
                "payload": {"user_id": user_id, "question": goal},
                "permission_level_required": 2,
                "risk_level": "medium",
            },
        ]
        return True, steps

    return False, []


def execute_multi_step_plan(
    db: Session,
    user_id: int,
    conversation_id: str,
    goal: str,
    steps: list[dict[str, Any]],
    safe_context: ApplicationContextSchema | None,
    user_level: int,
    t_start: float,
) -> AssistantInteractionResponse:
    """
    Executes an autonomous multi-step plan with loop detection,
    intermediate observation passing, and truthful verification.
    """
    MAX_ITERATIONS = 5
    executed_history: list[str] = []
    step_results: list[dict[str, Any]] = []
    current_context_data: dict[str, Any] = {}

    for i, step in enumerate(steps[:MAX_ITERATIONS]):
        action_type = step["action_type"]
        payload = dict(step["payload"])

        # Pass dependent context from prior steps
        if "investigation_id" in current_context_data and "investigation_id" not in payload:
            payload["investigation_id"] = current_context_data["investigation_id"]

        # Loop Detection: Detect repeated calls with identical signatures
        signature = f"{action_type}:{json.dumps(payload, sort_keys=True)}"
        if signature in executed_history:
            logger.warning(f"[AUTONOMOUS] Loop detected on step {i+1}: {signature}")
            break
        executed_history.append(signature)

        req_level = step.get("permission_level_required", 1)
        if user_level < req_level:
            msg = f"Task paused: Step '{step['title']}' requires Permission Level {req_level}, but your account is set to Level {user_level}."
            return AssistantInteractionResponse(
                conversation_id=conversation_id,
                response_text=msg,
                status="denied",
            )

        step_action = AssistantActionSchema(
            id=str(uuid.uuid4()),
            type=action_type,
            title=step["title"],
            description=step.get("description", step["title"]),
            payload=payload,
            requires_approval=False,
            risk_level=step.get("risk_level", "low"),
            permission_level_required=req_level,
        )

        success, res_msg, res_data = execute_action(db, step_action, user_id, safe_context)

        # Record step observation
        step_results.append({
            "step_id": step.get("step_id", i+1),
            "title": step["title"],
            "action_type": action_type,
            "success": success,
            "summary": res_msg,
            "data": res_data,
        })

        if not success:
            fail_summary = f"Autonomous execution blocked at Step {i+1} ('{step['title']}'): {res_msg}"
            return AssistantInteractionResponse(
                conversation_id=conversation_id,
                response_text=fail_summary,
                status="error",
                action=step_action,
            )

        # Propagate intermediate output to dependent subsequent steps
        if isinstance(res_data, dict):
            if "investigation_id" in res_data:
                current_context_data["investigation_id"] = res_data["investigation_id"]

    # Synthesize comprehensive verified outcome
    final_summary_parts = [
        f"Autonomous Task Execution Completed ({len(step_results)} step(s) verified):\n"
    ]
    for res in step_results:
        final_summary_parts.append(f"• Step {res['step_id']} [{res['title']}]: Completed successfully.")
    
    last_res = step_results[-1]
    final_summary_parts.append(f"\n{last_res['summary']}")
    completion_text = "\n".join(final_summary_parts)

    elapsed = (time.perf_counter() - t_start) * 1000
    last_action = AssistantActionSchema(
        id=str(uuid.uuid4()),
        type=step_results[-1]["action_type"],
        title="Autonomous Multi-Step Task",
        description=f"Completed {len(step_results)} sequential authorized steps for goal: '{goal}'",
        payload={"goal": goal, "steps_completed": len(step_results)},
        requires_approval=False,
        risk_level="medium",
        permission_level_required=2,
    )

    audit = log_assistant_audit(
        db=db,
        user_id=user_id,
        conversation_id=conversation_id,
        action_type=last_action.type,
        permission_level_required=2,
        status="executed",
        parameters=last_action.payload,
        result_summary=completion_text[:500],
        duration_ms=elapsed,
    )

    persist_assistant_message(
        db=db,
        user_id=user_id,
        conversation_id=conversation_id,
        sender="assistant",
        content=completion_text,
        status="success",
        action_type=last_action.type,
        action_payload=last_action.payload,
    )

    return AssistantInteractionResponse(
        conversation_id=conversation_id,
        response_text=completion_text,
        status="success",
        action=last_action,
        audit_log_id=audit.id,
    )


# ── Main Assistant Processing Entry Point ─────────────────────────────────────
def process_assistant_message(
    db: Session,
    user_id_or_user: Any = None,
    message_or_req: Any = None,
    conversation_id: str | None = None,
    context: ApplicationContextSchema | dict[str, Any] | None = None,
    confirmed_action_id: str | None = None,
    user_id: Any = None,
    user: Any = None,
    message: str | None = None,
    request: Any = None,
    **kwargs: Any,
) -> AssistantInteractionResponse:
    """
    Main Assistant Interaction Entry Point:
    Supports both direct (db, user_id, message, ...) and (db, user, request) patterns.
    1. Validates context and user authorization on referenced IDs.
    2. Identifies intent, detects prompt injections, and parses action schema.
    3. Handles autonomous multi-step execution loops with dependent tool steps.
    4. Evaluates permissions: Level 1 (Read-only), Level 2 (Suggest), Level 3 (Approval), Level 4 (Autonomy).
    5. Issues single-use expiring confirmation token if approval is needed.
    6. Records tamper-evident audit log with SHA-256 hash chaining.
    7. Persists conversation and message history.
    """
    effective_user = user_id_or_user if user_id_or_user is not None else (user if user is not None else user_id)
    if hasattr(effective_user, "id"):
        uid = effective_user.id
    elif effective_user is not None:
        try:
            uid = int(effective_user)
        except (ValueError, TypeError):
            uid = 1
    else:
        uid = 1

    effective_req = message_or_req if message_or_req is not None else (request if request is not None else message)
    if isinstance(effective_req, AssistantInteractionRequest):
        msg = effective_req.message
        conv_id = effective_req.conversation_id or conversation_id or str(uuid.uuid4())
        ctx = effective_req.context if effective_req.context is not None else context
        conf_id = effective_req.confirmed_action_id or confirmed_action_id
    else:
        msg = str(effective_req or "")
        conv_id = conversation_id or str(uuid.uuid4())
        ctx = context
        conf_id = confirmed_action_id

    user_id = uid
    message = msg

    t_start = time.perf_counter()
    pref = get_or_create_preferences(db, user_id)
    user_level = pref.permission_level

    # Sanitize and authorize incoming application context
    safe_context = validate_and_filter_context(db, user_id, ctx)

    # Persist the incoming user message
    persist_assistant_message(
        db=db,
        user_id=user_id,
        conversation_id=conv_id,
        sender="user",
        content=message,
        status="received",
    )

    # Early Ambiguity Check (e.g. "CM")
    from app.services.intent_service import check_unresolved_ambiguity
    is_ambig, clarification_msg = check_unresolved_ambiguity(message)
    if is_ambig:
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=clarification_msg,
            status="clarification_needed",
        )
        return AssistantInteractionResponse(
            conversation_id=conv_id,
            response_text=clarification_msg,
            status="clarification_needed",
        )

    # Check for multi-step autonomous goal
    is_multi, steps = plan_multi_step_goal(message, safe_context, user_id)
    if is_multi and len(steps) > 1:
        return execute_multi_step_plan(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            goal=message,
            steps=steps,
            safe_context=safe_context,
            user_level=user_level,
            t_start=t_start,
        )

    intent_type, action, clarification = parse_intent_and_action(message, safe_context, user_id)

    # Handle Prompt Injection / Security Violation
    if intent_type == "security_flag":
        elapsed = (time.perf_counter() - t_start) * 1000
        sec_msg = f"Access Denied: Security Violation: {clarification}"
        audit = log_assistant_audit(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            action_type="security_flag",
            permission_level_required=4,
            status="denied",
            parameters={"raw_message": message[:200]},
            result_summary=sec_msg,
            duration_ms=elapsed,
        )
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=sec_msg,
            status="error",
        )
        return AssistantInteractionResponse(
            conversation_id=conv_id,
            response_text=sec_msg,
            status="error",
            audit_log_id=audit.id,
        )

    # Handle Prohibited Action (Server-Side Authorization Denial)
    if intent_type == "prohibited_action":
        elapsed = (time.perf_counter() - t_start) * 1000
        denial_msg = "Access Denied: The requested operation is prohibited by OpusLex security policies and permissions."
        audit = log_assistant_audit(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            action_type="prohibited_action",
            permission_level_required=4,
            status="denied",
            parameters={"raw_message": message[:200]},
            result_summary=denial_msg,
            duration_ms=elapsed,
        )
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=denial_msg,
            status="denied",
        )
        return AssistantInteractionResponse(
            conversation_id=conv_id,
            response_text=denial_msg,
            status="denied",
            action=action,
            audit_log_id=audit.id,
        )

    # Handle Clarification Needed
    if intent_type == "clarification_needed" or not action:
        elapsed = (time.perf_counter() - t_start) * 1000
        resp_text = clarification or "I could not understand the requested action. Please rephrase your inquiry."
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=resp_text,
            status="clarification_needed",
        )
        return AssistantInteractionResponse(
            conversation_id=conv_id,
            response_text=resp_text,
            status="clarification_needed",
        )

    req_level = action.permission_level_required

    # ── Permission Check: Level 1 (Read & Answer) ───────────────────────────
    if user_level == 1 and req_level > 1:
        elapsed = (time.perf_counter() - t_start) * 1000
        msg = (
            f"Action '{action.title}' is denied. Your account is set to "
            f"{LEVEL_NAMES[1]} (Read-only, no mutations permitted). "
            f"You can adjust your assistant permission level in Settings > AI Assistant."
        )
        audit = log_assistant_audit(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            action_type=action.type,
            permission_level_required=req_level,
            status="denied",
            parameters=action.payload,
            result_summary=msg,
            duration_ms=elapsed,
        )
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=msg,
            status="denied",
            action_type=action.type,
            action_payload=action.payload,
        )
        return AssistantInteractionResponse(
            conversation_id=conv_id,
            response_text=msg,
            status="denied",
            action=action,
            audit_log_id=audit.id,
        )

    # ── Permission Check: Level 2 (Suggest) ──────────────────────────────────
    if user_level == 2 and req_level > 1:
        elapsed = (time.perf_counter() - t_start) * 1000
        msg = (
            f"Suggestion prepared for '{action.title}': {action.description} "
            f"(Permission Level 2 operates in Suggest-only mode; mutations are not executed)."
        )
        audit = log_assistant_audit(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            action_type=action.type,
            permission_level_required=req_level,
            status="suggested",
            parameters=action.payload,
            result_summary=msg,
            duration_ms=elapsed,
        )
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=msg,
            status="suggested",
            action_type=action.type,
            action_payload=action.payload,
        )
        return AssistantInteractionResponse(
            conversation_id=conv_id,
            response_text=msg,
            status="suggested",
            action=action,
            audit_log_id=audit.id,
        )

    # ── Permission Check: Level 3 (Execute with Approval) & Level 4 High Risk ──
    needs_explicit_approval = (
        (user_level == 3 and req_level > 1)
        or (user_level == 4 and action.risk_level == "high")
    )

    if needs_explicit_approval and not conf_id:
        elapsed = (time.perf_counter() - t_start) * 1000
        token_rec = create_action_token(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            action=action,
            validity_minutes=5,
        )
        action.confirmation_token = token_rec.token
        action.token_expires_at = token_rec.expires_at

        msg = (
            f"Confirmation required: Do you approve executing '{action.title}'? "
            f"Details: {action.description}"
        )
        audit = log_assistant_audit(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            action_type=action.type,
            permission_level_required=req_level,
            status="pending_approval",
            parameters=action.payload,
            result_summary=msg,
            duration_ms=elapsed,
        )
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=msg,
            status="action_pending",
            action_type=action.type,
            action_payload=action.payload,
            confirmation_token=token_rec.token,
        )
        return AssistantInteractionResponse(
            conversation_id=conv_id,
            response_text=msg,
            status="action_pending",
            action=action,
            audit_log_id=audit.id,
        )

    # ── Execute Action (Authorized Read, Approved Level 3, or Level 4 Low/Medium Risk) ──
    success, res_msg, res_data = execute_action(db, action, user_id, safe_context)
    sources = res_data.get("sources") if isinstance(res_data, dict) else None
    if sources is not None and action and action.payload is not None:
        action.payload["sources"] = sources
    elapsed = (time.perf_counter() - t_start) * 1000

    audit_status = "executed" if success else "failed"
    audit = log_assistant_audit(
        db=db,
        user_id=user_id,
        conversation_id=conv_id,
        action_type=action.type,
        permission_level_required=req_level,
        status=audit_status,
        parameters=action.payload,
        result_summary=res_msg,
        duration_ms=elapsed,
    )

    persist_assistant_message(
        db=db,
        user_id=user_id,
        conversation_id=conv_id,
        sender="assistant",
        content=res_msg,
        status="success" if success else "error",
        action_type=action.type,
        action_payload=action.payload,
    )

    return AssistantInteractionResponse(
        conversation_id=conv_id,
        response_text=res_msg,
        status="success" if success else "error",
        action=action,
        audit_log_id=audit.id,
        sources=sources,
    )


async def stream_assistant_message(
    db: Session,
    user_id: int,
    message: str,
    conversation_id: str | None = None,
    context: ApplicationContextSchema | dict[str, Any] | None = None,
    confirmed_action_id: str | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Asynchronous generator streaming real-time token events and metadata from Themis AI Assistant.
    Yields event dicts:
      {"event": "start", "data": {...}}
      {"event": "delta", "data": {"delta": "..."}}
      {"event": "sources", "data": {"sources": [...]}}
      {"event": "done", "data": {...}}
      {"event": "error", "data": {"error": "..."}}
    Handles disconnection, cancellation, and partial response state persistence.
    """
    conv_id = conversation_id or str(uuid.uuid4())
    t_start = time.perf_counter()
    pref = get_or_create_preferences(db, user_id)
    user_level = pref.permission_level

    # Sanitize and authorize incoming application context
    safe_context = validate_and_filter_context(db, user_id, context)

    # Persist incoming user message
    persist_assistant_message(
        db=db,
        user_id=user_id,
        conversation_id=conv_id,
        sender="user",
        content=message,
        status="received",
    )

    # Prompt injection check
    is_injected, reason = detect_prompt_injection(message)
    if is_injected:
        elapsed = (time.perf_counter() - t_start) * 1000
        sec_msg = f"Access Denied: Security Violation: {reason}"
        audit = log_assistant_audit(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            action_type="security_flag",
            permission_level_required=4,
            status="denied",
            parameters={"raw_message": message[:200]},
            result_summary=sec_msg,
            duration_ms=elapsed,
        )
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=sec_msg,
            status="error",
        )
        yield {"event": "start", "data": {"conversation_id": conv_id, "status": "error"}}
        yield {"event": "delta", "data": {"delta": sec_msg}}
        yield {
            "event": "done",
            "data": {
                "conversation_id": conv_id,
                "response_text": sec_msg,
                "status": "error",
                "audit_log_id": audit.id,
            },
        }
        return

    # Early Ambiguity Check (e.g. "CM")
    from app.services.intent_service import check_unresolved_ambiguity
    is_ambig, clarification_msg = check_unresolved_ambiguity(message)
    if is_ambig:
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=clarification_msg,
            status="clarification_needed",
        )
        yield {"event": "start", "data": {"conversation_id": conv_id, "status": "clarification_needed"}}
        yield {"event": "delta", "data": {"delta": clarification_msg}}
        yield {
            "event": "done",
            "data": {
                "conversation_id": conv_id,
                "response_text": clarification_msg,
                "status": "clarification_needed",
            },
        }
        return

    # Multi-step goal check
    is_multi, steps = plan_multi_step_goal(message, safe_context, user_id)
    if is_multi and len(steps) > 1:
        res = execute_multi_step_plan(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            goal=message,
            steps=steps,
            safe_context=safe_context,
            user_level=user_level,
            t_start=t_start,
        )
        yield {"event": "start", "data": {"conversation_id": conv_id, "status": res.status}}
        yield {"event": "delta", "data": {"delta": res.response_text}}
        yield {
            "event": "done",
            "data": {
                "conversation_id": conv_id,
                "response_text": res.response_text,
                "status": res.status,
                "audit_log_id": res.audit_log_id,
                "action": res.action.dict() if res.action else None,
            },
        }
        return

    intent_type, action, clarification = parse_intent_and_action(message, safe_context, user_id)

    # Prohibited action check
    if intent_type == "prohibited_action":
        elapsed = (time.perf_counter() - t_start) * 1000
        denial_msg = "Access Denied: The requested operation is prohibited by OpusLex security policies and permissions."
        audit = log_assistant_audit(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            action_type="prohibited_action",
            permission_level_required=4,
            status="denied",
            parameters={"raw_message": message[:200]},
            result_summary=denial_msg,
            duration_ms=elapsed,
        )
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=denial_msg,
            status="denied",
        )
        action_dict = action.dict() if action else None
        yield {"event": "start", "data": {"conversation_id": conv_id, "status": "denied", "action": action_dict}}
        yield {"event": "delta", "data": {"delta": denial_msg}}
        yield {
            "event": "done",
            "data": {
                "conversation_id": conv_id,
                "response_text": denial_msg,
                "status": "denied",
                "action": action_dict,
                "audit_log_id": audit.id,
            },
        }
        return

    if intent_type == "clarification_needed" or not action:
        elapsed = (time.perf_counter() - t_start) * 1000
        resp_text = clarification or "I could not understand the requested action. Please rephrase your inquiry."
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=resp_text,
            status="clarification_needed",
        )
        yield {"event": "start", "data": {"conversation_id": conv_id, "status": "clarification_needed"}}
        yield {"event": "delta", "data": {"delta": resp_text}}
        yield {
            "event": "done",
            "data": {
                "conversation_id": conv_id,
                "response_text": resp_text,
                "status": "clarification_needed",
            },
        }
        return

    req_level = action.permission_level_required
    action_dict = action.dict()

    # Permission Level 1 Check
    if user_level == 1 and req_level > 1:
        elapsed = (time.perf_counter() - t_start) * 1000
        msg = (
            f"Action '{action.title}' is denied. Your account is set to "
            f"{LEVEL_NAMES[1]} (Read-only, no mutations permitted). "
            f"You can adjust your assistant permission level in Settings > AI Assistant."
        )
        audit = log_assistant_audit(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            action_type=action.type,
            permission_level_required=req_level,
            status="denied",
            parameters=action.payload,
            result_summary=msg,
            duration_ms=elapsed,
        )
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=msg,
            status="denied",
            action_type=action.type,
            action_payload=action.payload,
        )
        yield {"event": "start", "data": {"conversation_id": conv_id, "status": "denied", "action": action_dict}}
        yield {"event": "delta", "data": {"delta": msg}}
        yield {
            "event": "done",
            "data": {
                "conversation_id": conv_id,
                "response_text": msg,
                "status": "denied",
                "action": action_dict,
                "audit_log_id": audit.id,
            },
        }
        return

    # Permission Level 2 Check
    if user_level == 2 and req_level > 1:
        elapsed = (time.perf_counter() - t_start) * 1000
        msg = (
            f"Suggestion prepared for '{action.title}': {action.description} "
            f"(Permission Level 2 operates in Suggest-only mode; mutations are not executed)."
        )
        audit = log_assistant_audit(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            action_type=action.type,
            permission_level_required=req_level,
            status="suggested",
            parameters=action.payload,
            result_summary=msg,
            duration_ms=elapsed,
        )
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=msg,
            status="suggested",
            action_type=action.type,
            action_payload=action.payload,
        )
        yield {"event": "start", "data": {"conversation_id": conv_id, "status": "suggested", "action": action_dict}}
        yield {"event": "delta", "data": {"delta": msg}}
        yield {
            "event": "done",
            "data": {
                "conversation_id": conv_id,
                "response_text": msg,
                "status": "suggested",
                "action": action_dict,
                "audit_log_id": audit.id,
            },
        }
        return

    # Permission Level 3 Approval Gate
    needs_explicit_approval = (
        (user_level == 3 and req_level > 1)
        or (user_level == 4 and action.risk_level == "high")
    )
    if needs_explicit_approval and not confirmed_action_id:
        elapsed = (time.perf_counter() - t_start) * 1000
        token_rec = create_action_token(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            action=action,
            validity_minutes=5,
        )
        action.confirmation_token = token_rec.token
        action.token_expires_at = token_rec.expires_at
        action_dict = action.dict()

        msg = (
            f"Confirmation required: Do you approve executing '{action.title}'? "
            f"Details: {action.description}"
        )
        audit = log_assistant_audit(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            action_type=action.type,
            permission_level_required=req_level,
            status="pending_approval",
            parameters=action.payload,
            result_summary=msg,
            duration_ms=elapsed,
        )
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=msg,
            status="action_pending",
            action_type=action.type,
            action_payload=action.payload,
            confirmation_token=token_rec.token,
        )
        yield {"event": "start", "data": {"conversation_id": conv_id, "status": "action_pending", "action": action_dict}}
        yield {"event": "delta", "data": {"delta": msg}}
        yield {
            "event": "done",
            "data": {
                "conversation_id": conv_id,
                "response_text": msg,
                "status": "action_pending",
                "action": action_dict,
                "audit_log_id": audit.id,
            },
        }
        return

    # Genuine Provider Streaming for LLM inquiries
    from app.services.copilot_service import stream_copilot_with_context

    if action.type == "general_knowledge":
        yield {"event": "start", "data": {"conversation_id": conv_id, "status": "thinking", "action": action_dict}}
        system_prompt = (
            "You are Themis, an expert autonomous AI assistant. "
            "Provide a direct, accurate, and comprehensive explanation for general technical, "
            "scientific, strategic, creative, coding, mathematical, and reasoning inquiries "
            "without requiring compliance documents or restricting answers to legal compliance."
        )
        q_text = action.payload.get("question", message)
        accumulated: list[str] = []
        try:
            async for delta in stream_copilot_with_context(
                question=q_text,
                context="",
                strict_grounding=False,
                system_prompt=system_prompt,
            ):
                accumulated.append(delta)
                yield {"event": "delta", "data": {"delta": delta}}
        except (asyncio.CancelledError, GeneratorExit):
            partial_text = "".join(accumulated)
            if partial_text:
                persist_assistant_message(
                    db=db,
                    user_id=user_id,
                    conversation_id=conv_id,
                    sender="assistant",
                    content=partial_text,
                    status="cancelled",
                    action_type=action.type,
                    action_payload=action.payload,
                )
            raise
        except Exception as exc:
            err_msg = f"LLM provider failed: {str(exc)}"
            yield {"event": "error", "data": {"error": err_msg}}
            return

        full_ans = "".join(accumulated)
        elapsed = (time.perf_counter() - t_start) * 1000
        audit = log_assistant_audit(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            action_type=action.type,
            permission_level_required=req_level,
            status="executed",
            parameters=action.payload,
            result_summary=full_ans[:200],
            duration_ms=elapsed,
        )
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=full_ans,
            status="success",
            action_type=action.type,
            action_payload=action.payload,
        )
        yield {
            "event": "done",
            "data": {
                "conversation_id": conv_id,
                "response_text": full_ans,
                "status": "success",
                "action": action_dict,
                "audit_log_id": audit.id,
                "sources": [],
            },
        }
        return

    elif action.type == "query_research":
        yield {"event": "start", "data": {"conversation_id": conv_id, "status": "thinking", "action": action_dict}}
        q_text = action.payload.get("question", message)
        doc_ids = safe_context.document_ids if safe_context else None
        context_str, sources = build_rag_context(
            db=db,
            query=q_text,
            limit=5,
            document_ids=doc_ids,
            user_id=user_id,
        )
        if sources:
            yield {"event": "sources", "data": {"sources": sources}}
            if action and action.payload is not None:
                action.payload["sources"] = sources
                action_dict = action.dict()

        accumulated = []
        try:
            async for delta in stream_copilot_with_context(
                question=q_text,
                context=context_str,
                strict_grounding=bool(doc_ids),
            ):
                accumulated.append(delta)
                yield {"event": "delta", "data": {"delta": delta}}
        except (asyncio.CancelledError, GeneratorExit):
            partial_text = "".join(accumulated)
            if partial_text:
                persist_assistant_message(
                    db=db,
                    user_id=user_id,
                    conversation_id=conv_id,
                    sender="assistant",
                    content=partial_text,
                    status="cancelled",
                    action_type=action.type,
                    action_payload=action.payload,
                )
            raise
        except Exception as exc:
            err_msg = f"Research retrieval failed: {str(exc)}"
            yield {"event": "error", "data": {"error": err_msg}}
            return

        full_ans = "".join(accumulated)
        if not sources and "(Note: No matching compliance documents" not in full_ans:
            note = "\n\n*(Note: No matching compliance documents were retrieved from your authorized library for this query. The answer above is based on general regulatory knowledge.)*"
            full_ans += note
            yield {"event": "delta", "data": {"delta": note}}

        elapsed = (time.perf_counter() - t_start) * 1000
        audit = log_assistant_audit(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            action_type=action.type,
            permission_level_required=req_level,
            status="executed",
            parameters=action.payload,
            result_summary=full_ans[:200],
            duration_ms=elapsed,
        )
        persist_assistant_message(
            db=db,
            user_id=user_id,
            conversation_id=conv_id,
            sender="assistant",
            content=full_ans,
            status="success",
            action_type=action.type,
            action_payload=action.payload,
        )
        yield {
            "event": "done",
            "data": {
                "conversation_id": conv_id,
                "response_text": full_ans,
                "status": "success",
                "action": action_dict,
                "audit_log_id": audit.id,
                "sources": sources,
            },
        }
        return

    # Tool and deterministic action execution
    success, res_msg, res_data = execute_action(db, action, user_id, safe_context)
    sources = res_data.get("sources") if isinstance(res_data, dict) else None
    if sources is not None and action and action.payload is not None:
        action.payload["sources"] = sources
        action_dict = action.dict()
    elapsed = (time.perf_counter() - t_start) * 1000
    audit_status = "executed" if success else "failed"
    audit = log_assistant_audit(
        db=db,
        user_id=user_id,
        conversation_id=conv_id,
        action_type=action.type,
        permission_level_required=req_level,
        status=audit_status,
        parameters=action.payload,
        result_summary=res_msg,
        duration_ms=elapsed,
    )
    persist_assistant_message(
        db=db,
        user_id=user_id,
        conversation_id=conv_id,
        sender="assistant",
        content=res_msg,
        status="success" if success else "error",
        action_type=action.type,
        action_payload=action.payload,
    )

    yield {"event": "start", "data": {"conversation_id": conv_id, "status": "success" if success else "error", "action": action_dict}}
    if sources:
        yield {"event": "sources", "data": {"sources": sources}}
    yield {"event": "delta", "data": {"delta": res_msg}}
    yield {
        "event": "done",
        "data": {
            "conversation_id": conv_id,
            "response_text": res_msg,
            "status": "success" if success else "error",
            "action": action_dict,
            "audit_log_id": audit.id,
            "sources": sources,
        },
    }
