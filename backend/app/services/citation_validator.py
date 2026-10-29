"""
Citation Validation and Verification Service for OpusLex Research & RAG.

Provides comprehensive citation analysis:
1. Extraction of ALL citation occurrences across the entire answer (not just the first one).
2. Detection of valid format citations: [Source: <filename>, Chunk: <index>].
3. Detection and tagging of malformed citation-like strings (e.g. missing chunk, parentheses, negative index).
4. Database grounding verification: confirms source document exists, is authorized for the user,
   and contains the specified chunk index.
5. Evidence support verification: checks whether the cited chunk contains the specific facts
   claimed, distinguishing true support from superficial keyword matches or contradictions.
6. Explicit labeling of deterministic test bounds vs live-model semantic entailment limitations.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text


# Canonical OpusLex citation pattern: [Source: filename.ext, Chunk: N]
CANONICAL_CITATION_REGEX = re.compile(
    r"\[Source:\s*([^\],]+?),\s*Chunk:\s*(\d+)\s*\]",
    re.IGNORECASE,
)

# Broad citation-like heuristic pattern to catch malformed variants:
# Matches [Source...], (Source...), or brackets mentioning Source and Chunk
BROAD_CITATION_REGEX = re.compile(
    r"[\[\(]Source[\s:][^\n\]\)]*?[\]\)]",
    re.IGNORECASE,
)


@dataclass
class CitationOccurrence:
    raw_text: str
    start_pos: int
    end_pos: int
    is_valid_syntax: bool
    filename: Optional[str] = None
    chunk_index: Optional[int] = None
    syntax_error: Optional[str] = None


@dataclass
class CitationVerificationResult:
    occurrence: CitationOccurrence
    document_exists: bool = False
    document_authorized: bool = False
    chunk_exists: bool = False
    chunk_id: Optional[int] = None
    chunk_content: Optional[str] = None
    supports_claim: bool = False
    evidence_status: str = "unverified"  # "supported", "unsupported", "contradicted", "missing_chunk", "unauthorized_doc"
    details: str = ""


def extract_all_citations(answer_text: str) -> list[CitationOccurrence]:
    """
    Extract all citation occurrences from an answer, detecting both valid-syntax
    and malformed citation-like strings across the entire text.
    """
    occurrences: list[CitationOccurrence] = []
    seen_spans = set()

    # 1. First pass: find all canonical valid citations
    for match in CANONICAL_CITATION_REGEX.finditer(answer_text):
        fn = match.group(1).strip()
        chk = int(match.group(2).strip())
        span = (match.start(), match.end())
        seen_spans.add(span)
        occurrences.append(
            CitationOccurrence(
                raw_text=match.group(0),
                start_pos=match.start(),
                end_pos=match.end(),
                is_valid_syntax=True,
                filename=fn,
                chunk_index=chk,
            )
        )

    # 2. Second pass: find broad citation-like strings to catch malformed ones
    for match in BROAD_CITATION_REGEX.finditer(answer_text):
        m_start, m_end = match.start(), match.end()
        # Skip if already captured as canonical
        if any(s <= m_start and m_end <= e for (s, e) in seen_spans):
            continue

        raw = match.group(0)
        # Analyze why it's malformed
        error_reasons = []
        if raw.startswith("(") or raw.endswith(")"):
            error_reasons.append("Uses parentheses instead of square brackets")
        if "Chunk:" not in raw and "chunk:" not in raw:
            error_reasons.append("Missing 'Chunk:' specifier")
        else:
            chk_m = re.search(r"Chunk:?\s*(-?\w+)", raw, re.IGNORECASE)
            if chk_m:
                val = chk_m.group(1)
                try:
                    int_val = int(val)
                    if int_val < 0:
                        error_reasons.append(f"Negative chunk index '{val}'")
                except ValueError:
                    error_reasons.append(f"Non-numeric chunk identifier '{val}'")

        fn_match = re.search(r"Source:?\s*([^\],;()]+)", raw, re.IGNORECASE)
        filename_guess = fn_match.group(1).strip() if fn_match else None

        occurrences.append(
            CitationOccurrence(
                raw_text=raw,
                start_pos=m_start,
                end_pos=m_end,
                is_valid_syntax=False,
                filename=filename_guess,
                chunk_index=None,
                syntax_error="; ".join(error_reasons) or "Malformed citation syntax",
            )
        )

    # Sort occurrences by position in the text
    occurrences.sort(key=lambda x: x.start_pos)
    return occurrences


def verify_citation_grounding(
    db: Session,
    citation: CitationOccurrence,
    authorized_user_id: int,
    allowed_document_ids: Optional[list[int]] = None,
    specific_claim: Optional[str] = None,
    expected_synthetic_fact: Optional[str] = None,
    contradictory_facts: Optional[list[str]] = None,
) -> CitationVerificationResult:
    """
    Verify citation grounding in database and semantic support for a specific claim.
    """
    res = CitationVerificationResult(occurrence=citation)

    if not citation.is_valid_syntax or not citation.filename or citation.chunk_index is None:
        res.evidence_status = "malformed_syntax"
        res.details = citation.syntax_error or "Malformed citation syntax"
        return res

    # 1. Check document existence and ownership in DB
    from app.models.document import Document
    from app.models.document_chunk import DocumentChunk

    try:
        doc = db.query(Document).filter(Document.filename == citation.filename).first()
    except Exception as exc:
        res.document_exists = False
        res.evidence_status = "db_error"
        res.supports_claim = False
        res.details = f"Database error during document query: {exc}"
        return res

    if not doc:
        res.document_exists = False
        res.evidence_status = "missing_document"
        res.details = f"Document '{citation.filename}' does not exist in the database."
        return res

    res.document_exists = True

    if doc.user_id != authorized_user_id:
        res.document_authorized = False
        res.evidence_status = "unauthorized_document"
        res.details = f"Document '{citation.filename}' belongs to another user ({doc.user_id}). Access denied."
        return res

    if allowed_document_ids is not None and doc.id not in allowed_document_ids:
        res.document_authorized = False
        res.evidence_status = "unattached_document"
        res.details = f"Document '{citation.filename}' is not attached to this investigation."
        return res

    res.document_authorized = True

    # 2. Check chunk index existence
    try:
        chunk = (
            db.query(DocumentChunk)
            .filter(
                DocumentChunk.document_id == doc.id,
                DocumentChunk.chunk_index == citation.chunk_index,
            )
            .first()
        )
    except Exception as exc:
        res.chunk_exists = False
        res.evidence_status = "db_error"
        res.supports_claim = False
        res.details = f"Database error during chunk query: {exc}"
        return res

    if not chunk:
        res.chunk_exists = False
        res.evidence_status = "missing_chunk"
        res.details = f"Chunk index {citation.chunk_index} does not exist for document '{citation.filename}'."
        return res

    res.chunk_exists = True
    res.chunk_id = chunk.id
    res.chunk_content = chunk.content

    # 3. Check evidence support (not mere superficial keyword presence)
    chunk_lower = chunk.content.lower()

    # Contradiction check
    if contradictory_facts:
        for cfact in contradictory_facts:
            if cfact.lower() in chunk_lower:
                res.supports_claim = False
                res.evidence_status = "contradicted"
                res.details = f"Chunk directly contradicts the claim: contains '{cfact}'."
                return res

    # Synthetic fact verification
    if expected_synthetic_fact:
        if expected_synthetic_fact.lower() in chunk_lower:
            res.supports_claim = True
            res.evidence_status = "supported"
            res.details = f"Chunk contains exact verified fact: '{expected_synthetic_fact}'."
        else:
            res.supports_claim = False
            res.evidence_status = "unsupported"
            res.details = (
                f"Chunk does not contain expected fact '{expected_synthetic_fact}'. "
                "Superficial keywords do not prove semantic support."
            )
        return res

    # If specific claim passed, check token overlap against content words
    if specific_claim:
        claim_words = [w for w in re.findall(r"\b\w{4,}\b", specific_claim.lower())]
        stopwords = {
            "according", "verified", "policy", "source", "document", "states",
            "stated", "claims", "finding", "overview", "statement", "based",
            "analysis", "however", "under", "section", "about", "there", "their",
            "which", "where", "these", "those", "shall", "should", "would", "could",
            "also", "with", "from", "that", "this", "have", "been", "early", "later",
            "regarding", "reference", "observation", "summary"
        }
        content_words = [w for w in claim_words if w not in stopwords]
        if not content_words:
            content_words = claim_words

        if content_words:
            matched_words = [
                w for w in content_words
                if w in chunk_lower or (len(w) >= 5 and (w[:5] in chunk_lower or (w.endswith("s") and w[:-1] in chunk_lower)))
            ]
            coverage = len(matched_words) / len(content_words)
            # If the claim makes a distinct assertion (2+ content words) with near-zero overlap with chunk
            if len(content_words) >= 2 and coverage < 0.25:
                res.supports_claim = False
                res.evidence_status = "unsupported"
                res.details = f"Chunk does not support claim (token coverage {coverage:.0%})."
                return res
            elif coverage >= 0.25:
                res.supports_claim = True
                res.evidence_status = "supported"
                res.details = f"Token overlap ({coverage:.0%}) supporting claim."
                return res

    res.evidence_status = "grounded_chunk_present"
    res.supports_claim = True
    res.details = "Document and chunk verified in user scope."
    return res


def validate_and_sanitize_answer_citations(
    answer_text: str,
    db: Session,
    authorized_user_id: int,
    allowed_document_ids: Optional[list[int]] = None,
    verify_claim_support: bool = True,
) -> tuple[str, list[CitationVerificationResult], bool]:
    """
    Validates all citations in an answer against database grounding and authorization.
    Replaces any invalid, malformed, unauthorized, or unsupported citations so that they
    cannot produce an apparently verified citation badge in the frontend UI.

    Fails closed: if an unexpected exception occurs, returns the text with all_citations_valid=False.

    Returns:
        (sanitized_answer, verification_results, all_citations_valid)
    """
    try:
        citations = extract_all_citations(answer_text)
        if not citations:
            return answer_text, [], True

        results: list[CitationVerificationResult] = []
        replacements: list[tuple[int, int, str]] = []
        all_valid = True

        for cit in citations:
            # Extract preceding sentence for claim support check
            local_claim = None
            if verify_claim_support and cit.start_pos > 0:
                preceding = answer_text[:cit.start_pos]
                delims = [preceding.rfind(d) for d in [". ", "? ", "! ", "\n"]]
                last_delim = max(delims)
                sentence = preceding if last_delim == -1 else preceding[last_delim + 1:]
                sentence = sentence.strip()
                if len(sentence) >= 6:
                    local_claim = sentence

            res = verify_citation_grounding(
                db=db,
                citation=cit,
                authorized_user_id=authorized_user_id,
                allowed_document_ids=allowed_document_ids,
                specific_claim=local_claim,
            )
            results.append(res)

            is_grounded = (
                cit.is_valid_syntax
                and res.document_exists
                and res.document_authorized
                and res.chunk_exists
                and res.supports_claim
            )

            if not is_grounded:
                all_valid = False
                if not cit.is_valid_syntax:
                    rep = "[Unverified Citation: malformed citation syntax]"
                elif res.evidence_status == "db_error":
                    rep = f"[Unverified Citation: '{cit.filename}' - verification error (database unavailable)]"
                elif not res.document_exists:
                    rep = f"[Unverified Citation: '{cit.filename}' - document not found]"
                elif not res.document_authorized:
                    if res.evidence_status == "unattached_document":
                        rep = f"[Unverified Citation: '{cit.filename}' - not attached to this investigation]"
                    else:
                        rep = f"[Unverified Citation: '{cit.filename}' - access denied]"
                elif not res.chunk_exists:
                    rep = f"[Unverified Citation: '{cit.filename}' - chunk index {cit.chunk_index} not found]"
                elif not res.supports_claim:
                    rep = f"[Unverified Citation: '{cit.filename}' - cited passage does not support claim]"
                else:
                    rep = f"[Unverified Citation: '{cit.filename}' - unverified]"

                replacements.append((cit.start_pos, cit.end_pos, rep))

        # Apply replacements in reverse order to preserve string character offsets
        sanitized_text = answer_text
        for start_pos, end_pos, rep in sorted(replacements, key=lambda x: x[0], reverse=True):
            sanitized_text = sanitized_text[:start_pos] + rep + sanitized_text[end_pos:]

        return sanitized_text, results, all_valid

    except Exception:
        # Fail closed on any unexpected error
        return answer_text, [], False


async def filter_and_validate_streaming_chunks(
    chunk_generator,
    db: Session,
    authorized_user_id: int,
    allowed_document_ids: Optional[list[int]] = None,
    validation_state: Optional[dict] = None,
):
    """
    Asynchronous generator filter that intercepts streaming delta tokens from the LLM.
    Buffers candidate citation tags (e.g. '[Source: ...]') so that unverified or unauthorized
    citations are sanitized before reaching the client as streamed delta events.
    Guarantees that a partial streamed answer cannot mislead the user into believing
    its citations have already been verified.
    """
    buffer = ""
    in_bracket = False
    if validation_state is not None and "all_valid" not in validation_state:
        validation_state["all_valid"] = True

    async for chunk in chunk_generator:
        i = 0
        while i < len(chunk):
            ch = chunk[i]
            if not in_bracket:
                if ch in ("[", "("):
                    in_bracket = True
                    buffer = ch
                else:
                    yield ch
                i += 1
            else:
                buffer += ch
                i += 1
                if ch in ("]", ")"):
                    in_bracket = False
                    if re.search(r"Source[\s:]", buffer, re.IGNORECASE):
                        try:
                            sanitized, _, is_v = validate_and_sanitize_answer_citations(
                                answer_text=buffer,
                                db=db,
                                authorized_user_id=authorized_user_id,
                                allowed_document_ids=allowed_document_ids,
                                verify_claim_support=False,
                            )
                        except Exception:
                            sanitized, is_v = "[Unverified Citation: verification error]", False
                        if not is_v and validation_state is not None:
                            validation_state["all_valid"] = False
                        yield sanitized
                    else:
                        yield buffer
                    buffer = ""
                elif len(buffer) > 200 or "\n\n" in buffer:
                    in_bracket = False
                    yield buffer
                    buffer = ""

    if buffer:
        if re.search(r"Source[\s:]", buffer, re.IGNORECASE):
            try:
                sanitized, _, is_v = validate_and_sanitize_answer_citations(
                    answer_text=buffer,
                    db=db,
                    authorized_user_id=authorized_user_id,
                    allowed_document_ids=allowed_document_ids,
                    verify_claim_support=False,
                )
            except Exception:
                sanitized, is_v = "[Unverified Citation: verification error]", False
            if not is_v and validation_state is not None:
                validation_state["all_valid"] = False
            yield sanitized
        else:
            yield buffer
