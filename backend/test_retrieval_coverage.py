from unittest.mock import patch
import pytest

from app.services.rag_service import build_rag_context

def test_retrieval_coverage():
    # Mock search_similar_chunks
    def mock_search_similar_chunks(db, query, limit, document_ids=None, user_id=None, **kwargs):
        if document_ids == [1]:
            return [{"document_id": 1, "document_title": "Doc 1", "document_filename": "doc1.txt", "chunk_index": 0, "distance": 0.1, "content": "chunk 1"}]
        elif document_ids == [2]:
            return [{"document_id": 2, "document_title": "Doc 2", "document_filename": "doc2.txt", "chunk_index": 0, "distance": 0.2, "content": "chunk 2"}]
        elif document_ids == [3]:
            return [] # No relevant chunks
        elif document_ids == [4]:
            return [{"document_id": 4, "document_title": "Doc 4", "document_filename": "doc4.txt", "chunk_index": 0, "distance": 0.4, "content": "chunk 4"}]
        elif document_ids == [5]:
            return [{"document_id": 5, "document_title": "Doc 5", "document_filename": "doc5.txt", "chunk_index": 0, "distance": 0.5, "content": "chunk 5"}]
        return []

    with patch("app.services.rag_service.search_similar_chunks", side_effect=mock_search_similar_chunks) as mock_search:
        # A. 1 attached document -> retrieval still works.
        context, sources = build_rag_context(None, "test", limit=5, document_ids=[1])
        assert len(sources) == 1
        assert sources[0]["document_id"] == 1
        assert mock_search.call_count == 1
        mock_search.reset_mock()

        # B. 2 attached documents -> both can contribute evidence.
        context, sources = build_rag_context(None, "test", limit=5, document_ids=[1, 2])
        assert len(sources) == 2
        assert {s["document_id"] for s in sources} == {1, 2}
        assert mock_search.call_count == 2
        mock_search.reset_mock()

        # C. 5 attached documents -> retrieval result contains evidence from all documents when each has relevant matching chunks.
        #    Wait, doc 3 has no chunks. Let's make doc 6 have chunks.
        def mock_search_5_docs(db, query, limit, document_ids=None, user_id=None, **kwargs):
            return [{"document_id": document_ids[0], "document_title": f"Doc {document_ids[0]}", "document_filename": f"doc{document_ids[0]}.txt", "chunk_index": 0, "distance": 0.1, "content": f"chunk {document_ids[0]}"}]

        with patch("app.services.rag_service.search_similar_chunks", side_effect=mock_search_5_docs) as mock_search_5:
            context, sources = build_rag_context(None, "test", limit=5, document_ids=[1, 2, 3, 4, 5])
            assert len(sources) == 5
            assert {s["document_id"] for s in sources} == {1, 2, 3, 4, 5}
            assert mock_search_5.call_count == 5

        # D. A document with no relevant chunks does not cause retrieval to fall back to an unrelated document.
        context, sources = build_rag_context(None, "test", limit=5, document_ids=[1, 2, 3])
        assert len(sources) == 2
        assert {s["document_id"] for s in sources} == {1, 2}
        assert mock_search.call_count == 3
        mock_search.reset_mock()

        # E. investigation_id=None preserves existing global retrieval behavior.
        # To test this, we check if search_similar_chunks was called ONCE with document_ids=None
        def mock_global(db, query, limit, document_ids=None, user_id=None, **kwargs):
            assert document_ids is None
            return [{"document_id": 99, "document_title": "Global Doc", "document_filename": "global.txt", "chunk_index": 0, "distance": 0.1, "content": "global chunk"}]
        
        with patch("app.services.rag_service.search_similar_chunks", side_effect=mock_global) as mock_search_global:
            context, sources = build_rag_context(None, "test", limit=5, document_ids=None)
            assert len(sources) == 1
            assert sources[0]["document_id"] == 99
            assert mock_search_global.call_count == 1
