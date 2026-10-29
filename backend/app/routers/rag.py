import asyncio
import json
import logging
import re
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.investigation import Investigation
from app.models.investigation_document import InvestigationDocument
from app.routers.auth import get_current_user
from app.services.copilot_service import ask_copilot_with_context, stream_copilot_with_context
from app.services.intent_service import check_unresolved_ambiguity, classify_query
from app.services.rag_service import answer_with_rag, build_rag_context
from app.services.retrieval_service import (
    get_investigation_document_ids,
    get_investigation_documents_metadata,
)


router = APIRouter(
    prefix="/api/v1/rag",
    tags=["RAG"],
)


class RAGRequest(BaseModel):
    question: str
    limit: int = 5
    investigation_id: int | None = None


@router.post("/ask")
async def ask_rag(
    request: RAGRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    clean_question = request.question.strip()
    if not clean_question:
        return {
            "question": "",
            "answer": "Please provide a question to answer.",
            "sources": [],
        }

    document_ids = None

    # ---------------------------------------------------------
    # Investigation-scoped RAG
    # ---------------------------------------------------------
    if request.investigation_id is not None:
        investigation_any = db.scalar(
            select(Investigation).where(Investigation.id == request.investigation_id)
        )
        if investigation_any is not None and investigation_any.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: you do not have permission to access this investigation",
            )

        investigation = investigation_any if (investigation_any and investigation_any.user_id == current_user.id) else None

        if investigation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Investigation not found",
            )

        # 1. Ambiguity handling (e.g. "What does CM say about these establishments?")
        is_ambig, clarification_msg = check_unresolved_ambiguity(clean_question)
        if is_ambig:
            return {
                "question": request.question,
                "answer": clarification_msg,
                "sources": [],
            }

        document_ids = get_investigation_document_ids(db, request.investigation_id, investigation)
        attached_meta = get_investigation_documents_metadata(db, request.investigation_id, investigation)

        # Classify query under investigation scope
        classification = classify_query(
            query=clean_question,
            investigation_id=request.investigation_id,
            investigation_title=investigation.title,
            attached_docs=attached_meta,
        )

        # Handle non-document-specific inquiries cleanly even within an investigation context
        if classification["intent"] == "identity":
            return {
                "question": request.question,
                "answer": "I am Themis, your AI personal assistant in OpusLex. In this investigation context, I help analyze attached evidence, verify compliance, and answer technical and analytical inquiries.",
                "sources": [],
            }

        if classification["intent"] == "calculation":
            return {
                "question": request.question,
                "answer": classification["calculation_explanation"],
                "sources": [],
            }

        if classification["intent"] == "document_overview":
            if not attached_meta:
                return {
                    "question": request.question,
                    "answer": "No documents are currently attached to this investigation. Attach relevant documents to this investigation to review their contents.",
                    "sources": [],
                }
            doc_lines = [f"• **{d.get('title', 'Document')}** (`{d.get('filename', '')}`)" for d in attached_meta]
            return {
                "question": request.question,
                "answer": (
                    f"This investigation (#{investigation.id} - '{investigation.title}') currently has {len(attached_meta)} attached document(s):\n\n"
                    f"{chr(10).join(doc_lines)}\n\n"
                    f"These documents form the isolated evidentiary scope for compliance queries, gap checks, and agent analyses within this matter."
                ),
                "sources": [{"filename": d.get("filename"), "title": d.get("title")} for d in attached_meta],
            }

        if classification["intent"] == "general_knowledge" and not classification.get("document_mention") and not classification.get("clause_mention"):
            answer = await ask_copilot_with_context(
                question=clean_question,
                context="",
                strict_grounding=False,
                system_prompt=(
                    "You are an expert AI research assistant. Provide clear, accurate, and comprehensive "
                    "answers to general knowledge, technical, explanatory, and reasoning questions. "
                    "Do not require uploaded documents or emit document-evidence limitation notices for general questions."
                ),
            )
            from app.services.citation_validator import validate_and_sanitize_answer_citations
            clean_ans, _, all_valid = validate_and_sanitize_answer_citations(
                answer_text=answer,
                db=db,
                authorized_user_id=current_user.id,
                allowed_document_ids=document_ids,
            )
            return {
                "question": request.question,
                "answer": clean_ans,
                "sources": [],
                "citations_verified": all_valid,
            }

        doc_mention = classification.get("document_mention")
        if not document_ids:
            if doc_mention:
                return {
                    "question": request.question,
                    "answer": f"The requested document or source ('{doc_mention}') is not available in this investigation. Please attach the required document to this investigation to query its clauses.",
                    "sources": [],
                }
            return {
                "question": request.question,
                "answer": "No documents are attached to this investigation. Please attach the relevant documents to proceed with investigation research.",
                "sources": [],
            }

        # 2. Document mention check (e.g. "What does clause 8.2 of this uploaded agreement say?")
        if doc_mention:
            mention_lower = doc_mention.lower()
            matched_docs = []
            for d in attached_meta:
                fn_lower = (d.get("filename") or "").lower()
                title_lower = (d.get("title") or "").lower()
                if mention_lower in fn_lower or mention_lower in title_lower:
                    matched_docs.append(d)
                elif ("agreement" in mention_lower or "contract" in mention_lower) and (
                    "agreement" in fn_lower or "contract" in fn_lower or "agreement" in title_lower or "contract" in title_lower
                ):
                    matched_docs.append(d)
                elif "policy" in mention_lower and ("policy" in fn_lower or "policy" in title_lower):
                    matched_docs.append(d)

            # If user explicitly asked for an agreement or specific document and it is absent:
            if not matched_docs:
                attached_filenames = ", ".join(f"'{d.get('filename')}'" for d in attached_meta)
                return {
                    "question": request.question,
                    "answer": (
                        f"The requested document or source ('{doc_mention}') is not available in this investigation. "
                        f"Documents currently attached are: {attached_filenames}. "
                        "Please attach the required document to this investigation to query its clauses."
                    ),
                    "sources": [],
                }

            # Prioritize matching document
            document_ids = [d["id"] for d in matched_docs if d.get("id") is not None]

        # 3. Clause / Section check
        clause_mention = classification.get("clause_mention")
        if clause_mention and document_ids:
            clause_match = re.search(r"\b\d+(?:\.\d+)*\b", clause_mention)
            clause_num = clause_match.group(0) if clause_match else clause_mention
            # Efficient check: verify if document has chunks, and if clause exists
            has_chunks = db.query(DocumentChunk.id).filter(DocumentChunk.document_id.in_(document_ids)).first() is not None
            if has_chunks:
                clause_exists = db.query(DocumentChunk.id).filter(
                    DocumentChunk.document_id.in_(document_ids),
                    DocumentChunk.content.ilike(f"%{clause_num}%"),
                ).first()

                if not clause_exists:
                    target_doc_names = ", ".join(f"'{d.get('filename')}'" for d in attached_meta if d.get("id") in document_ids)
                    return {
                        "question": request.question,
                        "answer": f"Clause {clause_num} was not found in {target_doc_names}. The document does not contain this specific clause or section.",
                        "sources": [],
                    }

    else:
        # ---------------------------------------------------------
        # Global RAG / General AI path (investigation_id is None)
        # ---------------------------------------------------------
        classification = classify_query(query=clean_question)

        # 1. Deterministic arithmetic calculation
        if classification["intent"] == "calculation":
            return {
                "question": request.question,
                "answer": classification["calculation_explanation"],
                "sources": [],
            }

        # 2. Identity inquiry
        if classification["intent"] == "identity":
            return {
                "question": request.question,
                "answer": "I am Themis, your AI personal assistant in OpusLex. I assist with legal and compliance research, policy analysis, investigation evidence analysis, and general analytical inquiries.",
                "sources": [],
            }

    # ---------------------------------------------------------
    # Execute RAG Retrieval
    # ---------------------------------------------------------
    try:
        result = await answer_with_rag(
            db=db,
            question=request.question,
            limit=request.limit,
            document_ids=document_ids,
            user_id=current_user.id if request.investigation_id is None else None,
            strict_grounding=(request.investigation_id is not None),
        )
    except RuntimeError as e:
        if "Copilot API failed:" in str(e):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The AI assistant service is currently unavailable or timed out.",
            )
        raise

    if request.investigation_id is not None and not result["sources"]:
        return {
            "question": request.question,
            "answer": (
                "No relevant evidence was found in the documents currently "
                "attached to this investigation. The documents do not "
                "contain matching provisions for this inquiry."
            ),
            "sources": [],
        }

    # Validate and sanitize citations before returning to user
    from app.services.citation_validator import validate_and_sanitize_answer_citations
    sanitized_answer, _, all_valid = validate_and_sanitize_answer_citations(
        answer_text=result["answer"],
        db=db,
        authorized_user_id=current_user.id,
        allowed_document_ids=document_ids,
    )

    return {
        "question": request.question,
        "answer": sanitized_answer,
        "sources": result["sources"],
        "citations_verified": all_valid,
    }


@router.post("/stream")
async def stream_rag(
    request: RAGRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    clean_question = request.question.strip()
    if not clean_question:
        async def empty_stream():
            yield f"event: start\ndata: {{}}\n\n"
            yield f"event: delta\ndata: {json.dumps({'delta': 'Please provide a question to answer.'})}\n\n"
            yield f"event: done\ndata: {json.dumps({'answer': 'Please provide a question to answer.', 'sources': []})}\n\n"
        return StreamingResponse(empty_stream(), media_type="text/event-stream")

    document_ids = None

    if request.investigation_id is not None:
        investigation_any = db.scalar(
            select(Investigation).where(Investigation.id == request.investigation_id)
        )
        if investigation_any is not None and investigation_any.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: you do not have permission to access this investigation",
            )
        investigation = investigation_any if (investigation_any and investigation_any.user_id == current_user.id) else None
        if investigation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Investigation not found",
            )

        # Ambiguity check
        is_ambig, clarification_msg = check_unresolved_ambiguity(clean_question)
        if is_ambig:
            async def ambig_stream():
                yield f"event: start\ndata: {{}}\n\n"
                yield f"event: delta\ndata: {json.dumps({'delta': clarification_msg})}\n\n"
                yield f"event: done\ndata: {json.dumps({'answer': clarification_msg, 'sources': []})}\n\n"
            return StreamingResponse(ambig_stream(), media_type="text/event-stream")

        document_ids = get_investigation_document_ids(db, request.investigation_id, investigation)
        attached_meta = get_investigation_documents_metadata(db, request.investigation_id, investigation)
        classification = classify_query(
            query=clean_question,
            investigation_id=request.investigation_id,
            investigation_title=investigation.title,
            attached_docs=attached_meta,
        )

        if classification["intent"] == "identity":
            ans = "I am Themis, your AI personal assistant in OpusLex. In this investigation context, I help analyze attached evidence, verify compliance, and answer technical and analytical inquiries."
            async def id_stream():
                yield f"event: start\ndata: {{}}\n\n"
                yield f"event: delta\ndata: {json.dumps({'delta': ans})}\n\n"
                yield f"event: done\ndata: {json.dumps({'answer': ans, 'sources': []})}\n\n"
            return StreamingResponse(id_stream(), media_type="text/event-stream")

        if classification["intent"] == "calculation":
            ans = classification["calculation_explanation"]
            async def calc_stream():
                yield f"event: start\ndata: {{}}\n\n"
                yield f"event: delta\ndata: {json.dumps({'delta': ans})}\n\n"
                yield f"event: done\ndata: {json.dumps({'answer': ans, 'sources': []})}\n\n"
            return StreamingResponse(calc_stream(), media_type="text/event-stream")

        if classification["intent"] == "document_overview":
            if not attached_meta:
                ans = "No documents are currently attached to this investigation. Attach relevant documents to this investigation to review their contents."
                srcs = []
            else:
                doc_lines = [f"• **{d.get('title', 'Document')}** (`{d.get('filename', '')}`)" for d in attached_meta]
                ans = (
                    f"This investigation (#{investigation.id} - '{investigation.title}') currently has {len(attached_meta)} attached document(s):\n\n"
                    f"{chr(10).join(doc_lines)}\n\n"
                    f"These documents form the isolated evidentiary scope for compliance queries, gap checks, and agent analyses within this matter."
                )
                srcs = [{"filename": d.get("filename"), "title": d.get("title")} for d in attached_meta]
            async def overview_stream():
                yield f"event: start\ndata: {{}}\n\n"
                if srcs:
                    yield f"event: sources\ndata: {json.dumps({'sources': srcs})}\n\n"
                yield f"event: delta\ndata: {json.dumps({'delta': ans})}\n\n"
                yield f"event: done\ndata: {json.dumps({'answer': ans, 'sources': srcs})}\n\n"
            return StreamingResponse(overview_stream(), media_type="text/event-stream")

        if classification["intent"] == "general_knowledge" and not classification.get("document_mention") and not classification.get("clause_mention"):
            async def gen_stream():
                yield f"event: start\ndata: {{}}\n\n"
                accum = []
                from app.services.citation_validator import (
                    filter_and_validate_streaming_chunks,
                    validate_and_sanitize_answer_citations,
                )
                raw_stream = stream_copilot_with_context(
                    question=clean_question,
                    context="",
                    strict_grounding=False,
                    system_prompt=(
                        "You are an expert AI research assistant. Provide clear, accurate, and comprehensive "
                        "answers to general knowledge, technical, explanatory, and reasoning questions. "
                        "Do not require uploaded documents or emit document-evidence limitation notices for general questions."
                    ),
                )
                val_state = {"all_valid": True}
                validated_stream = filter_and_validate_streaming_chunks(
                    chunk_generator=raw_stream,
                    db=db,
                    authorized_user_id=current_user.id,
                    allowed_document_ids=document_ids,
                    validation_state=val_state,
                )
                async for chunk in validated_stream:
                    accum.append(chunk)
                    yield f"event: delta\ndata: {json.dumps({'delta': chunk})}\n\n"
                full_ans = "".join(accum)
                _, _, all_valid = validate_and_sanitize_answer_citations(
                    answer_text=full_ans,
                    db=db,
                    authorized_user_id=current_user.id,
                    allowed_document_ids=document_ids,
                )
                is_verified = val_state.get("all_valid", True) and all_valid
                yield f"event: done\ndata: {json.dumps({'answer': full_ans, 'sources': [], 'citations_verified': is_verified})}\n\n"
            return StreamingResponse(gen_stream(), media_type="text/event-stream")

        doc_mention = classification.get("document_mention")
        if not document_ids:
            msg = f"The requested document or source ('{doc_mention}') is not available in this investigation. Please attach the required document to this investigation to query its clauses." if doc_mention else "No documents are attached to this investigation. Please attach the relevant documents to proceed with investigation research."
            async def nodoc_stream():
                yield f"event: start\ndata: {{}}\n\n"
                yield f"event: delta\ndata: {json.dumps({'delta': msg})}\n\n"
                yield f"event: done\ndata: {json.dumps({'answer': msg, 'sources': []})}\n\n"
            return StreamingResponse(nodoc_stream(), media_type="text/event-stream")

        if doc_mention:
            mention_lower = doc_mention.lower()
            matched_docs = []
            for d in attached_meta:
                fn_lower = (d.get("filename") or "").lower()
                title_lower = (d.get("title") or "").lower()
                if mention_lower in fn_lower or mention_lower in title_lower:
                    matched_docs.append(d)
                elif ("agreement" in mention_lower or "contract" in mention_lower) and (
                    "agreement" in fn_lower or "contract" in fn_lower or "agreement" in title_lower or "contract" in title_lower
                ):
                    matched_docs.append(d)
                elif "policy" in mention_lower and ("policy" in fn_lower or "policy" in title_lower):
                    matched_docs.append(d)

            if not matched_docs:
                attached_filenames = ", ".join(f"'{d.get('filename')}'" for d in attached_meta)
                msg = (
                    f"The requested document or source ('{doc_mention}') is not available in this investigation. "
                    f"Documents currently attached are: {attached_filenames}. "
                    "Please attach the required document to this investigation to query its clauses."
                )
                async def nomatch_stream():
                    yield f"event: start\ndata: {{}}\n\n"
                    yield f"event: delta\ndata: {json.dumps({'delta': msg})}\n\n"
                    yield f"event: done\ndata: {json.dumps({'answer': msg, 'sources': []})}\n\n"
                return StreamingResponse(nomatch_stream(), media_type="text/event-stream")

            document_ids = [d["id"] for d in matched_docs if d.get("id") is not None]

        clause_mention = classification.get("clause_mention")
        if clause_mention and document_ids:
            clause_match = re.search(r"\b\d+(?:\.\d+)*\b", clause_mention)
            clause_num = clause_match.group(0) if clause_match else clause_mention
            total_chunks = db.query(DocumentChunk).filter(DocumentChunk.document_id.in_(document_ids)).count()
            if total_chunks > 0:
                clause_exists = db.query(DocumentChunk).filter(
                    DocumentChunk.document_id.in_(document_ids),
                    DocumentChunk.content.ilike(f"%{clause_num}%"),
                ).first()
                if not clause_exists:
                    target_doc_names = ", ".join(f"'{d.get('filename')}'" for d in attached_meta if d.get("id") in document_ids)
                    msg = f"Clause {clause_num} was not found in {target_doc_names}. The document does not contain this specific clause or section."
                    async def noclause_stream():
                        yield f"event: start\ndata: {{}}\n\n"
                        yield f"event: delta\ndata: {json.dumps({'delta': msg})}\n\n"
                        yield f"event: done\ndata: {json.dumps({'answer': msg, 'sources': []})}\n\n"
                    return StreamingResponse(noclause_stream(), media_type="text/event-stream")

    else:
        # Global RAG (no investigation)
        classification = classify_query(query=clean_question)
        if classification["intent"] == "calculation":
            ans = classification["calculation_explanation"]
            async def calc_stream():
                yield f"event: start\ndata: {{}}\n\n"
                yield f"event: delta\ndata: {json.dumps({'delta': ans})}\n\n"
                yield f"event: done\ndata: {json.dumps({'answer': ans, 'sources': []})}\n\n"
            return StreamingResponse(calc_stream(), media_type="text/event-stream")

        if classification["intent"] == "identity":
            ans = "I am Themis, your AI personal assistant in OpusLex. I assist with legal and compliance research, policy analysis, investigation evidence analysis, and general analytical inquiries."
            async def id_stream():
                yield f"event: start\ndata: {{}}\n\n"
                yield f"event: delta\ndata: {json.dumps({'delta': ans})}\n\n"
                yield f"event: done\ndata: {json.dumps({'answer': ans, 'sources': []})}\n\n"
            return StreamingResponse(id_stream(), media_type="text/event-stream")

        if classification["intent"] == "general_knowledge":
            async def gen_stream():
                yield f"event: start\ndata: {{}}\n\n"
                accum = []
                from app.services.citation_validator import (
                    filter_and_validate_streaming_chunks,
                    validate_and_sanitize_answer_citations,
                )
                raw_stream = stream_copilot_with_context(
                    question=clean_question,
                    context="",
                    strict_grounding=False,
                    system_prompt=(
                        "You are an expert AI research assistant. Provide clear, accurate, and comprehensive "
                        "answers to general knowledge, technical, explanatory, and reasoning questions. "
                        "Do not require uploaded documents or emit document-evidence limitation notices for general questions."
                    ),
                )
                val_state = {"all_valid": True}
                validated_stream = filter_and_validate_streaming_chunks(
                    chunk_generator=raw_stream,
                    db=db,
                    authorized_user_id=current_user.id,
                    validation_state=val_state,
                )
                async for chunk in validated_stream:
                    accum.append(chunk)
                    yield f"event: delta\ndata: {json.dumps({'delta': chunk})}\n\n"
                full_ans = "".join(accum)
                _, _, all_valid = validate_and_sanitize_answer_citations(
                    answer_text=full_ans,
                    db=db,
                    authorized_user_id=current_user.id,
                )
                is_verified = val_state.get("all_valid", True) and all_valid
                yield f"event: done\ndata: {json.dumps({'answer': full_ans, 'sources': [], 'citations_verified': is_verified})}\n\n"
            return StreamingResponse(gen_stream(), media_type="text/event-stream")

    # Document-grounded streaming execution
    from app.services.embedding_service import generate_embedding_async
    query_embedding = await generate_embedding_async(request.question)
    context_str, sources = build_rag_context(
        db=db,
        query=request.question,
        limit=request.limit,
        document_ids=document_ids,
        user_id=current_user.id if request.investigation_id is None else None,
        query_embedding=query_embedding,
    )

    if request.investigation_id is not None and not sources:
        no_evidence_msg = (
            "No relevant evidence was found in the documents currently "
            "attached to this investigation. The documents do not "
            "contain matching provisions for this inquiry."
        )
        async def no_ev_stream():
            yield f"event: start\ndata: {{}}\n\n"
            yield f"event: delta\ndata: {json.dumps({'delta': no_evidence_msg})}\n\n"
            yield f"event: done\ndata: {json.dumps({'answer': no_evidence_msg, 'sources': []})}\n\n"
        return StreamingResponse(no_ev_stream(), media_type="text/event-stream")

    async def rag_event_stream():
        yield f"event: start\ndata: {{}}\n\n"
        if sources:
            yield f"event: sources\ndata: {json.dumps({'sources': sources})}\n\n"
        accum = []
        from app.services.citation_validator import (
            filter_and_validate_streaming_chunks,
            validate_and_sanitize_answer_citations,
        )

        raw_stream = stream_copilot_with_context(
            question=request.question,
            context=context_str,
            strict_grounding=(request.investigation_id is not None),
        )
        val_state = {"all_valid": True}
        validated_stream = filter_and_validate_streaming_chunks(
            chunk_generator=raw_stream,
            db=db,
            authorized_user_id=current_user.id,
            allowed_document_ids=document_ids,
            validation_state=val_state,
        )

        try:
            async for chunk in validated_stream:
                accum.append(chunk)
                yield f"event: delta\ndata: {json.dumps({'delta': chunk})}\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            pass
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
            return

        full_ans = "".join(accum)
        _, _, all_valid = validate_and_sanitize_answer_citations(
            answer_text=full_ans,
            db=db,
            authorized_user_id=current_user.id,
            allowed_document_ids=document_ids,
        )
        is_verified = val_state.get("all_valid", True) and all_valid
        yield f"event: done\ndata: {json.dumps({'answer': full_ans, 'sources': sources, 'citations_verified': is_verified})}\n\n"

    return StreamingResponse(
        rag_event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )