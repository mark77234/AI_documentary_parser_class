"""PDF 및 텍스트 파일에서 본문 추출."""

from __future__ import annotations

import io
from typing import Literal

from pypdf import PdfReader

SourceKind = Literal["pdf", "txt"]


def extract_from_bytes(data: bytes, source_kind: SourceKind) -> str:
    if source_kind == "txt":
        return _decode_text(data)
    if source_kind == "pdf":
        return _extract_pdf(data)
    raise ValueError(f"unsupported source_kind: {source_kind}")


def _decode_text(data: bytes) -> str:
    for enc in ("utf-8", "utf-8-sig", "cp949", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _extract_pdf(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            parts.append(t)
    return "\n\n".join(parts).strip()


def detect_kind(filename: str) -> SourceKind | None:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return "pdf"
    if lower.endswith(".txt"):
        return "txt"
    return None
