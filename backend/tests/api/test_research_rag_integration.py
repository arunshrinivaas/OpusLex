"""
OpusLex Stage 6 Phase 3: Research/RAG Citation Validator Integration & Ownership Enforcement Suite.

Verifies:
1. End-to-end integration of citation validation in `/api/v1/rag/ask` (non-streaming):
   - Unauthorized document citations (User B's documents) are sanitized.
   - Nonexistent document citations are sanitized.
   - Malformed syntax citations are sanitized.
   - Authorized user-owned citations are preserved in canonical format.
2. End-to-end integration of citation validation in `/api/v1/rag/stream` (streaming SSE):
   - Delta events buffer candidate citation tokens and sanitize unauthorized citations before emission.
   - Verifies that a partial streamed answer cannot mislead the user into believing citations have been verified.
   - Done event carries complete sanitized answer and verification status.
3. Investigation scoping:
   - User-owned document not attached to the investigation is flagged and sanitized.
4. History persistence sanitization:
   - Persisted `ResearchQuery` records in DB never store unverified or unauthorized citation tags.
5. Strict database isolation and exact-ID teardown with fail-closed ownership verification.
"""

from __future__ import annotations

import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import text
from unittest.mock import patch

from app.main import app
from app.database import SessionLocal
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.investigation import Investigation
from app.models.investigation_document import InvestigationDocument
from app.models.research import ResearchQuery
from app.security import create_access_token
from app.services.embedding_service import generate_embedding

USER_A_ID = 864
USER_A_EMAIL = "test_acceptance@opuslex.com"
USER_B_ID = 863
USER_B_EMAIL = "test_optimizer@opuslex.com"


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module")
def auth_headers_user_a():
    token = create_access_token(
        data={"sub": str(USER_A_ID), "email": USER_A_EMAIL, "role": "compliance_officer"}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def auth_headers_user_b():
    token = create_access_token(
        data={"sub": str(USER_B_ID), "email": USER_B_EMAIL, "role": "compliance_officer"}
    )
    return {"Authorization": f"Bearer {token}"}


def test_preflight_database_isolation(db_session: Session):
    """Verify runtime database connection is strictly legal_compliance_isolated_test_db."""
    import urllib.parse
    url_str = str(db_session.get_bind().url)
    parsed = urllib.parse.urlparse(url_str)
    db_name = parsed.path.lstrip('/')
    assert db_name == "legal_compliance_isolated_test_db", f"Critical Isolation Failure: Bound to '{db_name}'"


class TestCitationValidatorIntegration:
    @pytest.fixture(autouse=True)
    def setup_synthetic_documents(self, db_session: Session):
        created_doc_ids: list[int] = []
        created_chunk_ids: list[int] = []
        created_inv_ids: list[int] = []

        try:
            # 1. Document A1 (User A) - Legitimate Policy
            doc_a1 = Document(
                title="Synthetic User A Policy Alpha",
                filename="synth_user_a_policy.pdf",
                file_hash="fakehash_synth_a1",
                document_type="Policy",
                jurisdiction="US",
                user_id=USER_A_ID,
            )
            db_session.add(doc_a1)
            db_session.commit()
            db_session.refresh(doc_a1)
            created_doc_ids.append(doc_a1.id)

            chunk_a1 = DocumentChunk(
                document_id=doc_a1.id,
                chunk_index=0,
                content="Audit logs must be retained for exactly 7 years under ISO-27001 standard section 4.1.",
                embedding=generate_embedding("Audit logs must be retained for exactly 7 years"),
            )
            db_session.add(chunk_a1)
            db_session.commit()
            db_session.refresh(chunk_a1)
            created_chunk_ids.append(chunk_a1.id)

            # 2. Document A2 (User A) - Unattached Policy
            doc_a2 = Document(
                title="Synthetic User A Unattached Policy",
                filename="synth_user_a_unattached.pdf",
                file_hash="fakehash_synth_a2",
                document_type="Policy",
                jurisdiction="US",
                user_id=USER_A_ID,
            )
            db_session.add(doc_a2)
            db_session.commit()
            db_session.refresh(doc_a2)
            created_doc_ids.append(doc_a2.id)

            chunk_a2 = DocumentChunk(
                document_id=doc_a2.id,
                chunk_index=0,
                content="Whistleblower protections must be reviewed quarterly.",
                embedding=generate_embedding("Whistleblower protections must be reviewed quarterly"),
            )
            db_session.add(chunk_a2)
            db_session.commit()
            db_session.refresh(chunk_a2)
            created_chunk_ids.append(chunk_a2.id)

            # 3. Document B1 (User B) - Confidential
            doc_b1 = Document(
                title="Synthetic User B Secret Document",
                filename="synth_user_b_secret.pdf",
                file_hash="fakehash_synth_b1",
                document_type="Confidential",
                jurisdiction="US",
                user_id=USER_B_ID,
            )
            db_session.add(doc_b1)
            db_session.commit()
            db_session.refresh(doc_b1)
            created_doc_ids.append(doc_b1.id)

            chunk_b1 = DocumentChunk(
                document_id=doc_b1.id,
                chunk_index=0,
                content="Project Pegasus secret key is PEGASUS_TOP_SECRET.",
                embedding=generate_embedding("Project Pegasus secret key"),
            )
            db_session.add(chunk_b1)
            db_session.commit()
            db_session.refresh(chunk_b1)
            created_chunk_ids.append(chunk_b1.id)

            # 4. Investigation for User A with only Doc A1 attached
            inv_a = Investigation(
                title="Synthetic Investigation Alpha",
                description="Investigation for testing scoped citation validation",
                status="Active",
                user_id=USER_A_ID,
            )
            db_session.add(inv_a)
            db_session.commit()
            db_session.refresh(inv_a)
            created_inv_ids.append(inv_a.id)

            inv_doc = InvestigationDocument(
                investigation_id=inv_a.id,
                document_id=doc_a1.id,
            )
            db_session.add(inv_doc)
            db_session.commit()

            self.doc_a1_id = doc_a1.id
            self.doc_a2_id = doc_a2.id
            self.doc_b1_id = doc_b1.id
            self.inv_a_id = inv_a.id

            yield

        finally:
            # Teardown with strict fail-closed ownership verification
            db_session.rollback()
            for inv_id in list(created_inv_ids):
                inv = db_session.query(Investigation).filter_by(id=inv_id).first()
                if inv:
                    assert inv.user_id == USER_A_ID, f"SAFETY ABORT: Foreign investigation {inv_id}"
                    db_session.query(InvestigationDocument).filter_by(investigation_id=inv_id).delete()
                    db_session.delete(inv)
            db_session.commit()

            for c_id in list(created_chunk_ids):
                chk = db_session.query(DocumentChunk).filter_by(id=c_id).first()
                if chk:
                    db_session.delete(chk)
            db_session.commit()

            for d_id in list(created_doc_ids):
                doc = db_session.query(Document).filter_by(id=d_id).first()
                if doc:
                    assert doc.user_id in (USER_A_ID, USER_B_ID), f"SAFETY ABORT: Foreign doc {d_id}"
                    db_session.delete(doc)
            db_session.commit()

    def test_ask_rag_sanitizes_unauthorized_and_invalid_citations(
        self, client: TestClient, auth_headers_user_a: dict
    ):
        """
        Verify that /api/v1/rag/ask invokes citation validation and sanitizes
        unauthorized, nonexistent, and malformed citations, while preserving authorized citations.
        """
        raw_llm_answer = (
            "According to verified policy, retention is 7 years [Source: synth_user_a_policy.pdf, Chunk: 0]. "
            "However, unauthorized source claims secret key [Source: synth_user_b_secret.pdf, Chunk: 0]. "
            "Nonexistent document cited here [Source: nonexistent_doc.pdf, Chunk: 1]. "
            "Malformed citation also detected [Source: bad_syntax_no_chunk]."
        )

        with patch("app.routers.rag.ask_copilot_with_context", return_value=raw_llm_answer), \
             patch("app.services.rag_service.ask_copilot_with_context", return_value=raw_llm_answer):
            res = client.post(
                "/api/v1/rag/ask",
                headers=auth_headers_user_a,
                json={"question": "What are the compliance rules?"},
            )
            assert res.status_code == 200
            data = res.json()
            answer = data["answer"]

            # Authorized citation MUST be preserved in canonical format
            assert "[Source: synth_user_a_policy.pdf, Chunk: 0]" in answer

            # Unauthorized citation (User B's doc) MUST NOT remain in [Source: ...] format
            assert "[Source: synth_user_b_secret.pdf, Chunk: 0]" not in answer
            assert "synth_user_b_secret.pdf" in answer
            assert "access denied" in answer.lower() or "unauthorized" in answer.lower()

            # Nonexistent doc citation MUST NOT remain in [Source: ...] format
            assert "[Source: nonexistent_doc.pdf, Chunk: 1]" not in answer
            assert "document not found" in answer.lower()

            # Malformed citation MUST NOT remain in [Source: ...] format
            assert "[Source: bad_syntax_no_chunk]" not in answer
            assert "malformed" in answer.lower()

            # Citations verified indicator must be False due to invalid citations
            assert data.get("citations_verified") is False

    def test_stream_rag_prevents_unverified_citation_leakage_in_deltas(
        self, client: TestClient, auth_headers_user_a: dict
    ):
        """
        Verify that /api/v1/rag/stream buffers candidate citation tokens and sanitizes
        unauthorized citations before streaming deltas to the client.
        """
        # Token chunks as generated by LLM
        tokens = [
            "Based on ", "the analysis, ",
            "[Source: ", "synth_user_a_policy.pdf, ", "Chunk: ", "0]. ",
            "Confidential leak: ",
            "[Source: ", "synth_user_b_secret.pdf, ", "Chunk: ", "0].",
        ]

        async def mock_stream(*args, **kwargs):
            for t in tokens:
                yield t

        with patch("app.routers.rag.stream_copilot_with_context", side_effect=mock_stream):
            res = client.post(
                "/api/v1/rag/stream",
                headers=auth_headers_user_a,
                json={"question": "What is in the files?"},
            )
            assert res.status_code == 200

            # Parse SSE events from response body
            lines = res.text.split("\n")
            deltas = []
            done_payload = None

            for i, line in enumerate(lines):
                if line.startswith("event: delta"):
                    # Next line should be data: {...}
                    data_line = lines[i + 1]
                    if data_line.startswith("data:"):
                        payload = json.loads(data_line[5:].strip())
                        deltas.append(payload.get("delta", ""))
                elif line.startswith("event: done"):
                    data_line = lines[i + 1]
                    if data_line.startswith("data:"):
                        done_payload = json.loads(data_line[5:].strip())

            streamed_text = "".join(deltas)

            # 1. Delta stream MUST NOT contain User B's raw citation
            assert "[Source: synth_user_b_secret.pdf, Chunk: 0]" not in streamed_text

            # 2. Delta stream MUST contain the sanitized unverified notice
            assert "synth_user_b_secret.pdf" in streamed_text
            assert "access denied" in streamed_text.lower() or "unauthorized" in streamed_text.lower()

            # 3. Delta stream MUST contain User A's legitimate citation
            assert "[Source: synth_user_a_policy.pdf, Chunk: 0]" in streamed_text

            # 4. Done event must reflect sanitized answer and verification status
            assert done_payload is not None
            assert "[Source: synth_user_b_secret.pdf, Chunk: 0]" not in done_payload["answer"]
            assert done_payload.get("citations_verified") is False

    def test_investigation_scoped_citation_enforcement(
        self, client: TestClient, auth_headers_user_a: dict
    ):
        """
        Verify that an unattached document (owned by User A, but not attached to the investigation)
        is flagged as unattached when querying under investigation scope.
        """
        raw_llm_answer = (
            "Retention is 7 years [Source: synth_user_a_policy.pdf, Chunk: 0]. "
            "Whistleblower review is quarterly [Source: synth_user_a_unattached.pdf, Chunk: 0]."
        )

        with patch("app.routers.rag.ask_copilot_with_context", return_value=raw_llm_answer), \
             patch("app.services.rag_service.ask_copilot_with_context", return_value=raw_llm_answer):
            res = client.post(
                "/api/v1/rag/ask",
                headers=auth_headers_user_a,
                json={
                    "question": "What does the investigation cover?",
                    "investigation_id": self.inv_a_id,
                },
            )
            assert res.status_code == 200
            data = res.json()
            answer = data["answer"]

            # Attached document citation is preserved
            assert "[Source: synth_user_a_policy.pdf, Chunk: 0]" in answer

            # Unattached document citation MUST be sanitized
            assert "[Source: synth_user_a_unattached.pdf, Chunk: 0]" not in answer
            assert "not attached to this investigation" in answer.lower()
            assert data.get("citations_verified") is False

    def test_persisted_research_session_sanitization(
        self, client: TestClient, db_session: Session, auth_headers_user_a: dict
    ):
        """
        Verify that /api/v1/research/query sanitizes citations before persisting the session in DB.
        """
        tracked_session_ids: list[int] = []
        try:
            raw_llm_answer = (
                "Verified retention is 7 years [Source: synth_user_a_policy.pdf, Chunk: 0]. "
                "Leaked key is [Source: synth_user_b_secret.pdf, Chunk: 0]."
            )

            with patch("app.services.research_service.ask_copilot_with_context", return_value=raw_llm_answer), \
                 patch("app.services.rag_service.ask_copilot_with_context", return_value=raw_llm_answer):
                res = client.post(
                    "/api/v1/research/query",
                    headers=auth_headers_user_a,
                    json={"question": "Research retention policies and keys"},
                )
                assert res.status_code == 200
                data = res.json()
                sess_id = data["id"]
                tracked_session_ids.append(sess_id)

                # API response should be sanitized
                assert "[Source: synth_user_b_secret.pdf, Chunk: 0]" not in data["answer"]
                assert "[Source: synth_user_a_policy.pdf, Chunk: 0]" in data["answer"]

                # Directly inspect persisted row in DB
                db_row = db_session.query(ResearchQuery).filter_by(id=sess_id).first()
                assert db_row is not None
                assert db_row.user_id == USER_A_ID
                assert "[Source: synth_user_b_secret.pdf, Chunk: 0]" not in db_row.answer
                assert "[Source: synth_user_a_policy.pdf, Chunk: 0]" in db_row.answer
                assert "access denied" in db_row.answer.lower() or "unauthorized" in db_row.answer.lower()

        finally:
            for s_id in tracked_session_ids:
                row = db_session.query(ResearchQuery).filter_by(id=s_id).first()
                if row:
                    assert row.user_id == USER_A_ID, f"SAFETY ABORT: Foreign session {s_id}"
                    db_session.delete(row)
            db_session.commit()

    def test_fabricated_document_and_chunk_index_marked_unverified(
        self, client: TestClient, auth_headers_user_a: dict
    ):
        """
        Req 1: A fabricated document filename or chunk index cannot be presented as a verified citation.
        """
        raw_llm_answer = (
            "Fabricated document cited: [Source: fake_compliance_doc_xyz.pdf, Chunk: 0]. "
            "Real document with nonexistent chunk: [Source: synth_user_a_policy.pdf, Chunk: 999]."
        )

        with patch("app.routers.rag.ask_copilot_with_context", return_value=raw_llm_answer), \
             patch("app.services.rag_service.ask_copilot_with_context", return_value=raw_llm_answer):
            res = client.post(
                "/api/v1/rag/ask",
                headers=auth_headers_user_a,
                json={"question": "Verify compliance details"},
            )
            assert res.status_code == 200
            data = res.json()
            answer = data["answer"]

            # Fabricated doc must not be in [Source: ...] format
            assert "[Source: fake_compliance_doc_xyz.pdf, Chunk: 0]" not in answer
            assert "document not found" in answer.lower()

            # Nonexistent chunk must not be in [Source: ...] format
            assert "[Source: synth_user_a_policy.pdf, Chunk: 999]" not in answer
            assert "chunk index 999 not found" in answer.lower()

            # Result must fail closed as unverified
            assert data.get("citations_verified") is False

    def test_foreign_user_document_citation_marked_unverified(
        self, client: TestClient, auth_headers_user_a: dict
    ):
        """
        Req 2: A citation to another user's document is rejected or clearly marked unverified.
        """
        raw_llm_answer = (
            "Legitimate: [Source: synth_user_a_policy.pdf, Chunk: 0]. "
            "Foreign document: [Source: synth_user_b_secret.pdf, Chunk: 0]."
        )

        with patch("app.routers.rag.ask_copilot_with_context", return_value=raw_llm_answer), \
             patch("app.services.rag_service.ask_copilot_with_context", return_value=raw_llm_answer):
            res = client.post(
                "/api/v1/rag/ask",
                headers=auth_headers_user_a,
                json={"question": "Check security policies"},
            )
            assert res.status_code == 200
            data = res.json()
            answer = data["answer"]

            assert "[Source: synth_user_a_policy.pdf, Chunk: 0]" in answer
            assert "[Source: synth_user_b_secret.pdf, Chunk: 0]" not in answer
            assert "access denied" in answer.lower() or "unauthorized" in answer.lower()
            assert data.get("citations_verified") is False

    def test_unattached_document_in_investigation_marked_unverified(
        self, client: TestClient, auth_headers_user_a: dict
    ):
        """
        Req 3: A document that exists but is not attached to the authorized investigation
        cannot be cited as investigation evidence.
        """
        raw_llm_answer = (
            "Attached policy: [Source: synth_user_a_policy.pdf, Chunk: 0]. "
            "Unattached policy: [Source: synth_user_a_unattached.pdf, Chunk: 0]."
        )

        with patch("app.routers.rag.ask_copilot_with_context", return_value=raw_llm_answer), \
             patch("app.services.rag_service.ask_copilot_with_context", return_value=raw_llm_answer):
            res = client.post(
                "/api/v1/rag/ask",
                headers=auth_headers_user_a,
                json={
                    "question": "What policies apply to this investigation?",
                    "investigation_id": self.inv_a_id,
                },
            )
            assert res.status_code == 200
            data = res.json()
            answer = data["answer"]

            assert "[Source: synth_user_a_policy.pdf, Chunk: 0]" in answer
            assert "[Source: synth_user_a_unattached.pdf, Chunk: 0]" not in answer
            assert "not attached to this investigation" in answer.lower()
            assert data.get("citations_verified") is False

    def test_malformed_syntax_cannot_bypass_validation(
        self, client: TestClient, auth_headers_user_a: dict
    ):
        """
        Req 4: Malformed citation syntax cannot bypass validation.
        """
        raw_llm_answer = (
            "Parentheses format: (Source: synth_user_a_policy.pdf, Chunk: 0). "
            "Missing chunk format: [Source: synth_user_a_policy.pdf]. "
            "Negative chunk: [Source: synth_user_a_policy.pdf, Chunk: -1]. "
            "Non-numeric chunk: [Source: synth_user_a_policy.pdf, Chunk: sec0]."
        )

        with patch("app.routers.rag.ask_copilot_with_context", return_value=raw_llm_answer), \
             patch("app.services.rag_service.ask_copilot_with_context", return_value=raw_llm_answer):
            res = client.post(
                "/api/v1/rag/ask",
                headers=auth_headers_user_a,
                json={"question": "Verify syntax handling"},
            )
            assert res.status_code == 200
            data = res.json()
            answer = data["answer"]

            # All malformed variations must be sanitized and replaced
            assert "(Source: synth_user_a_policy.pdf, Chunk: 0)" not in answer
            assert "[Source: synth_user_a_policy.pdf]" not in answer
            assert "[Source: synth_user_a_policy.pdf, Chunk: -1]" not in answer
            assert "[Source: synth_user_a_policy.pdf, Chunk: sec0]" not in answer
            assert "malformed citation syntax" in answer.lower()
            assert data.get("citations_verified") is False

    def test_multiple_citations_in_long_response_all_validated(
        self, client: TestClient, auth_headers_user_a: dict
    ):
        """
        Req 5: Multiple citations in one answer are all checked, including citations near the end of long responses.
        """
        padding = "Detailed legal and compliance analysis regarding operational data governance. " * 20  # ~1600 chars
        raw_llm_answer = (
            f"Early finding regarding retention [Source: synth_user_a_policy.pdf, Chunk: 0].\n\n"
            f"{padding}\n\n"
            f"Middle unauthorized reference [Source: synth_user_b_secret.pdf, Chunk: 0].\n\n"
            f"{padding}\n\n"
            f"Later finding regarding audit [Source: synth_user_a_policy.pdf, Chunk: 0].\n\n"
            f"Final observation citing fake doc [Source: fake_deep_doc.pdf, Chunk: 0]."
        )

        with patch("app.routers.rag.ask_copilot_with_context", return_value=raw_llm_answer), \
             patch("app.services.rag_service.ask_copilot_with_context", return_value=raw_llm_answer):
            res = client.post(
                "/api/v1/rag/ask",
                headers=auth_headers_user_a,
                json={"question": "Comprehensive analysis of policies"},
            )
            assert res.status_code == 200
            data = res.json()
            answer = data["answer"]

            # Valid citations preserved
            assert answer.count("[Source: synth_user_a_policy.pdf, Chunk: 0]") == 2

            # Unauthorized and fake citations sanitized regardless of position in deep text
            assert "[Source: synth_user_b_secret.pdf, Chunk: 0]" not in answer
            assert "access denied" in answer.lower()

            assert "[Source: fake_deep_doc.pdf, Chunk: 0]" not in answer
            assert "document not found" in answer.lower()

            assert data.get("citations_verified") is False

    def test_unsupported_factual_claim_near_valid_citation_marked_unverified(
        self, client: TestClient, auth_headers_user_a: dict
    ):
        """
        Req 6: An unsupported factual claim is not presented as evidence-backed merely because
        a valid citation appears nearby.
        """
        # Document synth_user_a_policy.pdf is about ISO-27001 7-year audit log retention.
        # This claim is completely unsupported by the cited chunk.
        unsupported_answer = (
            "The corporate cafeteria provides complimentary espresso, croissants, and sushi daily "
            "[Source: synth_user_a_policy.pdf, Chunk: 0]."
        )

        with patch("app.routers.rag.ask_copilot_with_context", return_value=unsupported_answer), \
             patch("app.services.rag_service.ask_copilot_with_context", return_value=unsupported_answer):
            res = client.post(
                "/api/v1/rag/ask",
                headers=auth_headers_user_a,
                json={"question": "What amenities does the company offer?"},
            )
            assert res.status_code == 200
            data = res.json()
            answer = data["answer"]

            # The citation must NOT remain in verified [Source: ...] format
            assert "[Source: synth_user_a_policy.pdf, Chunk: 0]" not in answer
            assert "does not support claim" in answer.lower()
            assert data.get("citations_verified") is False

    def test_streaming_does_not_leak_unverified_citation_before_validation(
        self, client: TestClient, auth_headers_user_a: dict
    ):
        """
        Req 7: The streaming endpoint does not emit a verified citation badge before its validation is complete.
        """
        # Incremental token stream splitting an unauthorized citation
        tokens = [
            "Executive ", "summary: ",
            "[", "Source", ": ", "synth_", "user_b_", "secret", ".pdf", ", ", "Chunk", ": ", "0", "]",
            " was ", "consulted.",
        ]

        async def mock_stream(*args, **kwargs):
            for t in tokens:
                yield t

        with patch("app.routers.rag.stream_copilot_with_context", side_effect=mock_stream):
            res = client.post(
                "/api/v1/rag/stream",
                headers=auth_headers_user_a,
                json={"question": "Stream summary"},
            )
            assert res.status_code == 200

            deltas = []
            done_payload = None
            lines = res.text.split("\n")
            for i, line in enumerate(lines):
                if line.startswith("event: delta"):
                    data_line = lines[i + 1]
                    if data_line.startswith("data:"):
                        payload = json.loads(data_line[5:].strip())
                        deltas.append(payload.get("delta", ""))
                elif line.startswith("event: done"):
                    data_line = lines[i + 1]
                    if data_line.startswith("data:"):
                        done_payload = json.loads(data_line[5:].strip())

            # Verify no individual delta contains the raw citation opening
            for delta in deltas:
                assert "[Source: synth_user_b_secret.pdf" not in delta

            combined = "".join(deltas)
            assert "[Source: synth_user_b_secret.pdf, Chunk: 0]" not in combined
            assert "access denied" in combined.lower()

            assert done_payload is not None
            assert done_payload.get("citations_verified") is False

    def test_database_failure_fails_closed_without_marking_verified(
        self, client: TestClient, auth_headers_user_a: dict
    ):
        """
        Req 8: If citation validation fails or the database is unavailable, the endpoint
        does not silently report the answer as verified.
        """
        raw_llm_answer = (
            "Retention is verified under policy [Source: synth_user_a_policy.pdf, Chunk: 0]."
        )

        with patch("app.routers.rag.ask_copilot_with_context", return_value=raw_llm_answer), \
             patch("app.services.rag_service.ask_copilot_with_context", return_value=raw_llm_answer), \
             patch("app.services.citation_validator.verify_citation_grounding", side_effect=Exception("Simulated DB timeout")):
            res = client.post(
                "/api/v1/rag/ask",
                headers=auth_headers_user_a,
                json={"question": "Verify with simulated database error"},
            )
            assert res.status_code == 200
            data = res.json()

            # Must fail closed: citations_verified MUST NOT be True
            assert data.get("citations_verified") is False

    def test_non_streaming_and_streaming_expose_consistent_verification_status(
        self, client: TestClient, auth_headers_user_a: dict
    ):
        """
        Req 9: The non-streaming and streaming endpoints expose consistent verification status.
        """
        valid_answer = (
            "Audit logs must be retained for exactly 7 years [Source: synth_user_a_policy.pdf, Chunk: 0]."
        )
        invalid_answer = (
            "Policy says 7 years [Source: synth_user_b_secret.pdf, Chunk: 0]."
        )

        # 1. Test Valid Answer Consistency
        with patch("app.routers.rag.ask_copilot_with_context", return_value=valid_answer), \
             patch("app.services.rag_service.ask_copilot_with_context", return_value=valid_answer):
            res_ask = client.post("/api/v1/rag/ask", headers=auth_headers_user_a, json={"question": "Retention"})
            assert res_ask.status_code == 200
            ask_status = res_ask.json().get("citations_verified")
            assert ask_status is True

        async def valid_stream(*args, **kwargs):
            yield valid_answer

        with patch("app.routers.rag.stream_copilot_with_context", side_effect=valid_stream):
            res_stream = client.post("/api/v1/rag/stream", headers=auth_headers_user_a, json={"question": "Retention"})
            assert res_stream.status_code == 200
            lines = res_stream.text.split("\n")
            stream_status = None
            for i, line in enumerate(lines):
                if line.startswith("event: done"):
                    data = json.loads(lines[i + 1][5:].strip())
                    stream_status = data.get("citations_verified")
            assert stream_status is True
            assert ask_status == stream_status

        # 2. Test Invalid Answer Consistency
        with patch("app.routers.rag.ask_copilot_with_context", return_value=invalid_answer), \
             patch("app.services.rag_service.ask_copilot_with_context", return_value=invalid_answer):
            res_ask_inv = client.post("/api/v1/rag/ask", headers=auth_headers_user_a, json={"question": "Secret"})
            assert res_ask_inv.status_code == 200
            ask_inv_status = res_ask_inv.json().get("citations_verified")
            assert ask_inv_status is False

        async def invalid_stream(*args, **kwargs):
            yield invalid_answer

        with patch("app.routers.rag.stream_copilot_with_context", side_effect=invalid_stream):
            res_stream_inv = client.post("/api/v1/rag/stream", headers=auth_headers_user_a, json={"question": "Secret"})
            assert res_stream_inv.status_code == 200
            lines = res_stream_inv.text.split("\n")
            stream_inv_status = None
            for i, line in enumerate(lines):
                if line.startswith("event: done"):
                    data = json.loads(lines[i + 1][5:].strip())
                    stream_inv_status = data.get("citations_verified")
            assert stream_inv_status is False
            assert ask_inv_status == stream_inv_status

    def test_streaming_malformed_bracket_boundary_resilience(
        self, client: TestClient, auth_headers_user_a: dict
    ):
        """
        Req 3/Resilience: Malformed stream boundaries (open unclosed bracket) flush safely
        without stalling or hanging the stream generator.
        """
        tokens = [
            "Introductory text. ",
            "[Source: unclosed_bracket_reference_without_closing ",
            "continues with extra tokens that exceed limit or newline\n\n",
            "Next paragraph continues cleanly.",
        ]

        async def mock_stream(*args, **kwargs):
            for t in tokens:
                yield t

        with patch("app.routers.rag.stream_copilot_with_context", side_effect=mock_stream):
            res = client.post(
                "/api/v1/rag/stream",
                headers=auth_headers_user_a,
                json={"question": "Test bracket recovery"},
            )
            assert res.status_code == 200
            assert "event: done" in res.text
            assert "Next paragraph continues cleanly." in res.text
