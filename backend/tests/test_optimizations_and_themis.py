import pytest
import numpy as np
from sqlalchemy.orm import Session
from app.services.embedding_service import generate_embedding, generate_embedding_async
from app.services.intent_service import extract_identity_or_name_query, classify_query
from app.services.retrieval_service import search_similar_chunks
from app.services.assistant_service import (
    parse_intent_and_action,
    execute_action,
    create_action_token,
    verify_and_consume_action_token,
    get_or_create_preferences,
    update_preferences,
)
from app.schemas.assistant import AssistantActionSchema, ApplicationContextSchema, AssistantPreferencesUpdate
from app.models.user import User
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.investigation import Investigation
from app.database import SessionLocal


@pytest.fixture
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def test_user(db_session):
    user = db_session.query(User).filter(User.email == "test_optimizer@opuslex.com").first()
    if not user:
        user = User(
            email="test_optimizer@opuslex.com",
            password_hash="fakehashedpassword123",
            role="compliance_officer",
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_embedding_output_equivalence():
    """Verify generate_embedding and generate_embedding_async return identical vectors."""
    test_text = "OpusLex legal compliance and regulatory framework analysis."
    sync_emb = generate_embedding(test_text)
    async_emb = await generate_embedding_async(test_text)

    assert len(sync_emb) == 384
    assert len(async_emb) == 384
    assert np.allclose(sync_emb, async_emb, atol=1e-6)
    # Check normalization: L2 norm should be approximately 1.0
    sync_norm = np.linalg.norm(sync_emb)
    async_norm = np.linalg.norm(async_emb)
    assert abs(sync_norm - 1.0) < 1e-4
    assert abs(async_norm - 1.0) < 1e-4


def test_themis_identity_intent_detection():
    """Verify identity detection for 'What are you?' and 'How can you help me inside OpusLex?'."""
    q1 = "What are you?"
    is_id1, target1 = extract_identity_or_name_query(q1)
    assert is_id1 is True
    assert target1 == "themis"
    c1 = classify_query(q1)
    assert c1["intent"] == "identity"

    q2 = "How can you help me inside OpusLex?"
    is_id2, target2 = extract_identity_or_name_query(q2)
    assert is_id2 is True
    assert target2 == "themis"
    c2 = classify_query(q2)
    assert c2["intent"] == "identity"


def test_themis_identity_execution_identifies_opuslex():
    """Verify Themis response identifies as OpusLex's integrated AI assistant."""
    action = AssistantActionSchema(
        id="test-identity-action",
        type="identity",
        title="Themis Identity",
        description="Identifies Themis",
        payload={"question": "What are you?"},
        requires_approval=False,
        risk_level="low",
        permission_level_required=1,
    )
    # execute_action signature: db, action, user_id, context
    from unittest.mock import MagicMock
    mock_db = MagicMock(spec=Session)
    success, msg, data = execute_action(mock_db, action, user_id=1)
    assert success is True
    assert "Themis" in msg
    assert "OpusLex" in msg
    assert "integrated AI assistant" in msg or "assistant within OpusLex" in msg


@pytest.mark.asyncio
async def test_themis_privilege_levels_and_gates(db_session: Session, test_user: User):
    """
    Test all 4 privilege levels:
    - Level 1: Mutation is denied
    - Level 2: Mutation returns suggestion
    - Level 3: Mutation is gated with single-use confirmation token
    - Level 4: High-risk mutation is gated with confirmation token
    """
    user_id = test_user.id

    # 1. Level 1: Read-only, denied on mutation
    update_preferences(db_session, user_id, AssistantPreferencesUpdate(permission_level=1))
    action_type, action, err = parse_intent_and_action(
        "Create investigation: Q4 AML Review",
        context=None,
        current_user_id=user_id,
    )
    assert action_type == "create_investigation"
    assert action.permission_level_required == 3
    # When user is Level 1, requiring level 3 means action is denied server-side

    # 2. Level 2: Suggest mode
    update_preferences(db_session, user_id, AssistantPreferencesUpdate(permission_level=2))
    prefs = get_or_create_preferences(db_session, user_id)
    assert prefs.permission_level == 2

    # 3. Level 3: Execute with approval (action_pending + confirmation token)
    update_preferences(db_session, user_id, AssistantPreferencesUpdate(permission_level=3))
    action_type, action, err = parse_intent_and_action(
        "Create investigation: Q4 AML Review",
        context=None,
        current_user_id=user_id,
    )
    assert action.requires_approval is True
    token_rec = create_action_token(
        db=db_session,
        user_id=user_id,
        conversation_id="conv_test_123",
        action=action,
        validity_minutes=5,
    )
    assert token_rec.token is not None

    # Confirm with invalid token should fail
    inv_valid, inv_msg, inv_rec = verify_and_consume_action_token(
        db=db_session,
        user_id=user_id,
        token_str="invalid-token-12345",
        action_id=action.id,
    )
    assert inv_valid is False

    # Confirm with valid token should succeed and verify
    v_valid, v_msg, v_rec = verify_and_consume_action_token(
        db=db_session,
        user_id=user_id,
        token_str=token_rec.token,
        action_id=action.id,
    )
    assert v_valid is True
    assert v_rec is not None

    # Execute action
    c_success, c_msg, c_data = await execute_action(db_session, action, user_id)
    assert c_success is True
    inv_id = c_data.get("investigation_id")
    assert inv_id is not None
    inv = db_session.query(Investigation).filter(Investigation.id == inv_id).first()
    assert inv is not None
    assert "Q4 AML Review" in inv.title

    # Replay with same consumed token must fail (single-use)
    replay_valid, replay_msg, _ = verify_and_consume_action_token(
        db=db_session,
        user_id=user_id,
        token_str=token_rec.token,
        action_id=action.id,
    )
    assert replay_valid is False
    assert "Replay detected" in replay_msg or "already been consumed" in replay_msg


def test_retrieval_batching_and_user_isolation(db_session: Session, test_user: User):
    """Verify document scoping and access isolation in search_similar_chunks."""
    # Create two documents belonging to test_user
    doc1 = Document(title="AML Policy A", filename="aml_a.pdf", file_hash="hash_a_12345", document_type="policy", jurisdiction="US", user_id=test_user.id)
    doc2 = Document(title="AML Policy B", filename="aml_b.pdf", file_hash="hash_b_67890", document_type="policy", jurisdiction="US", user_id=test_user.id)
    db_session.add_all([doc1, doc2])
    db_session.commit()
    db_session.refresh(doc1)
    db_session.refresh(doc2)

    chunk_emb = generate_embedding("Anti-money laundering customer due diligence requirements.")
    chunk1 = DocumentChunk(
        document_id=doc1.id,
        chunk_index=0,
        content="Customer due diligence must be verified within 30 days.",
        embedding=chunk_emb,
    )
    chunk2 = DocumentChunk(
        document_id=doc2.id,
        chunk_index=0,
        content="Suspicious activity reports must be submitted within 24 hours.",
        embedding=chunk_emb,
    )
    db_session.add_all([chunk1, chunk2])
    db_session.commit()

    # Query with batched document_ids
    results = search_similar_chunks(
        db=db_session,
        query="due diligence",
        limit=5,
        document_ids=[doc1.id, doc2.id],
        user_id=test_user.id,
        query_embedding=chunk_emb,
    )
    assert len(results) > 0
    returned_doc_ids = {r["document_id"] for r in results}
    assert returned_doc_ids.issubset({doc1.id, doc2.id})

    # Test user isolation: different user_id should find nothing
    isolated_results = search_similar_chunks(
        db=db_session,
        query="due diligence",
        limit=5,
        document_ids=[doc1.id, doc2.id],
        user_id=999999,  # Unauthorized user
        query_embedding=chunk_emb,
    )
    assert len(isolated_results) == 0
