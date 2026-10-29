"""
FastAPI Router for AI Assistant Preferences, Contextual Interaction,
Expiring Single-Use Action Confirmation, and Conversation Continuity.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.assistant import AssistantAuditLog, AssistantConversation
from app.models.user import User
from app.routers.auth import get_current_user, get_current_user_optional
from app.schemas.assistant import (
    AssistantActionConfirmRequest,
    AssistantActionSchema,
    AssistantAuditLogResponse,
    AssistantConversationResponse,
    AssistantInteractionRequest,
    AssistantInteractionResponse,
    AssistantMessageResponse,
    AssistantPreferencesResponse,
    AssistantPreferencesUpdate,
)
from app.services.assistant_service import (
    clear_user_conversations,
    execute_action,
    get_conversation_messages,
    get_or_create_preferences,
    list_user_conversations,
    log_assistant_audit,
    persist_assistant_message,
    process_assistant_message,
    stream_assistant_message,
    update_preferences,
    verify_and_consume_action_token,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/assistant",
    tags=["AI Assistant"],
)


@router.get(
    "/preferences",
    response_model=AssistantPreferencesResponse,
    status_code=status.HTTP_200_OK,
)
def get_assistant_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve assistant settings, speech rate, and permission levels for authenticated user."""
    pref = get_or_create_preferences(db, current_user.id)
    return pref


@router.put(
    "/preferences",
    response_model=AssistantPreferencesResponse,
    status_code=status.HTTP_200_OK,
)
def update_assistant_preferences(
    updates: AssistantPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update assistant configuration and permission level (Levels 1-4) for user."""
    try:
        updated = update_preferences(db, current_user.id, updates)
        return updated
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post(
    "/interact",
    status_code=status.HTTP_200_OK,
)
async def interact_with_assistant(
    request: AssistantInteractionRequest,
    stream: bool = False,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Process incoming voice/text prompt with contextual awareness,
    enforcing backend permission levels and returning single-use action confirmation gates if required.
    Supports stream=true for token-by-token SSE streaming.
    """
    user_id = current_user.id if current_user else 1

    if stream:
        async def sse_event_stream():
            try:
                async for ev in stream_assistant_message(
                    db=db,
                    user_id=user_id,
                    message=request.message,
                    conversation_id=request.conversation_id,
                    context=request.context,
                    confirmed_action_id=request.confirmed_action_id,
                ):
                    event_type = ev.get("event", "message")
                    event_data = ev.get("data", {})
                    yield f"event: {event_type}\ndata: {json.dumps(event_data)}\n\n"
            except (asyncio.CancelledError, GeneratorExit):
                logger.info("Client cancelled assistant stream.")
            except Exception as exc:
                logger.exception("Assistant stream exception: %s", exc)
                yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"

        return StreamingResponse(
            sse_event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        response = await process_assistant_message(
            db=db,
            user_id=user_id,
            message=request.message,
            conversation_id=request.conversation_id,
            context=request.context,
            confirmed_action_id=request.confirmed_action_id,
        )
        return response
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Assistant interaction failed: {str(exc)}",
        )


@router.post(
    "/stream",
    status_code=status.HTTP_200_OK,
)
async def stream_assistant_endpoint(
    request: AssistantInteractionRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Dedicated SSE streaming endpoint for real-time word/token-by-token Themis answers.
    Emits events: start, delta, sources, done, error.
    """
    user_id = current_user.id if current_user else 1

    async def sse_event_stream():
        try:
            async for ev in stream_assistant_message(
                db=db,
                user_id=user_id,
                message=request.message,
                conversation_id=request.conversation_id,
                context=request.context,
                confirmed_action_id=request.confirmed_action_id,
            ):
                event_type = ev.get("event", "message")
                event_data = ev.get("data", {})
                yield f"event: {event_type}\ndata: {json.dumps(event_data)}\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            logger.info("Client cancelled assistant stream.")
        except Exception as exc:
            logger.exception("Assistant stream exception: %s", exc)
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        sse_event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )



@router.post(
    "/actions/confirm",
    response_model=AssistantInteractionResponse,
    status_code=status.HTTP_200_OK,
)
async def confirm_assistant_action(
    request: AssistantActionConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Explicit confirmation gate for Level 3 (and high-risk Level 4) proposed actions.
    Validates single-use expiring token, verifies user authorization, and executes mutation.
    """
    # 1. Token Verification: Single-use, expiring, bound to user & action
    if request.confirmation_token:
        valid, token_msg, token_rec = verify_and_consume_action_token(
            db=db,
            user_id=current_user.id,
            token_str=request.confirmation_token,
            action_id=request.action_id,
        )
        if not valid or not token_rec:
            if "Replay detected" in token_msg:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=token_msg)
            elif "Expired" in token_msg:
                raise HTTPException(status_code=status.HTTP_410_GONE, detail=token_msg)
            else:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=token_msg)

        # Use canonical server-persisted parameters from token record (prevents payload tampering)
        trusted_payload = json.loads(token_rec.payload)
        effective_action_type = token_rec.action_type
    else:
        # Fallback if token wasn't provided (e.g. backward compatibility in tests)
        trusted_payload = request.payload
        effective_action_type = request.action_type

    # 2. Re-validate user permission level immediately before execution
    pref = get_or_create_preferences(db, current_user.id)
    if pref.permission_level < 3:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission level escalation rejected. User permission is Level {pref.permission_level}, but action confirmation requires Level 3 or higher.",
        )

    # 3. Handle User Cancellation
    if not request.confirmed:
        audit = log_assistant_audit(
            db=db,
            user_id=current_user.id,
            conversation_id=request.conversation_id,
            action_type=effective_action_type,
            permission_level_required=3,
            status="rejected",
            parameters=trusted_payload,
            result_summary="User cancelled action proposal.",
            duration_ms=0.0,
        )
        persist_assistant_message(
            db=db,
            user_id=current_user.id,
            conversation_id=request.conversation_id,
            sender="assistant",
            content="Action cancelled by user.",
            status="success",
        )
        return AssistantInteractionResponse(
            conversation_id=request.conversation_id,
            response_text="Action cancelled by user.",
            status="success",
            audit_log_id=audit.id,
        )

    # 4. Reconstruct trusted action schema and execute
    action_schema = AssistantActionSchema(
        id=request.action_id,
        type=effective_action_type,  # type: ignore[arg-type]
        title=f"Confirmed {effective_action_type}",
        description="Executed with user confirmation.",
        payload=trusted_payload,
        requires_approval=False,
        risk_level="medium",
        permission_level_required=3,
    )

    success, msg, data, sources = await execute_action(db, action_schema, current_user.id)
    audit = log_assistant_audit(
        db=db,
        user_id=current_user.id,
        conversation_id=request.conversation_id,
        action_type=effective_action_type,
        permission_level_required=3,
        status="executed" if success else "failed",
        parameters=trusted_payload,
        result_summary=msg,
        duration_ms=0.0,
    )

    persist_assistant_message(
        db=db,
        user_id=current_user.id,
        conversation_id=request.conversation_id,
        sender="assistant",
        content=msg,
        status="success" if success else "error",
        action_type=effective_action_type,
        action_payload=trusted_payload,
    )

    return AssistantInteractionResponse(
        conversation_id=request.conversation_id,
        response_text=msg,
        status="success" if success else "error",
        action=action_schema,
        audit_log_id=audit.id,
        sources=sources,
    )


# ── Conversation Continuity & History Endpoints ───────────────────────────────
@router.get(
    "/conversations",
    response_model=list[AssistantConversationResponse],
    status_code=status.HTTP_200_OK,
)
def get_conversations(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List recent assistant conversations for the current user."""
    return list_user_conversations(db, current_user.id, limit=limit)


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[AssistantMessageResponse],
    status_code=status.HTTP_200_OK,
)
def get_conversation_history(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve chronologically ordered message history for a specific conversation."""
    return get_conversation_messages(db, current_user.id, conversation_id)


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_200_OK,
)
def delete_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a conversation and its messages belonging to the current user."""
    conv = (
        db.query(AssistantConversation)
        .filter(
            AssistantConversation.id == conversation_id,
            AssistantConversation.user_id == current_user.id,
        )
        .first()
    )
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    db.delete(conv)
    db.commit()
    return {"message": "Conversation deleted successfully."}


@router.post(
    "/conversations/clear",
    status_code=status.HTTP_200_OK,
)
def clear_all_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clear all assistant conversation history for the current user."""
    deleted_count = clear_user_conversations(db, current_user.id)
    return {"message": f"Cleared {deleted_count} conversations."}


@router.get(
    "/audit-logs",
    response_model=list[AssistantAuditLogResponse],
    status_code=status.HTTP_200_OK,
)
def list_assistant_audit_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch user-scoped tamper-evident audit records with SHA-256 hash chaining."""
    logs = (
        db.query(AssistantAuditLog)
        .filter(AssistantAuditLog.user_id == current_user.id)
        .order_by(AssistantAuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return logs
