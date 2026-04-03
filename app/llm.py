"""OpenAI 호환 API로 요약·리포트 및 문서 근거 Q&A."""

from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI

MAX_CONTEXT_CHARS = 120_000

# 일부 OpenAI 프로젝트는 gpt-4o-mini 등 특정 모델만 허용하거나 반대로 제외합니다.
# 403 / model_not_found 시 OPENAI_DEFAULT_MODEL 또는 OPENAI_*_MODEL 을 대시보드에 있는 모델명으로 설정하세요.
_DEFAULT_CHAT_MODEL = "gpt-5-mini"


def _chat_model(*, summary: bool) -> str:
    if summary:
        return (
            os.environ.get("OPENAI_SUMMARY_MODEL")
            or os.environ.get("OPENAI_DEFAULT_MODEL")
            or _DEFAULT_CHAT_MODEL
        )
    return (
        os.environ.get("OPENAI_QA_MODEL")
        or os.environ.get("OPENAI_DEFAULT_MODEL")
        or _DEFAULT_CHAT_MODEL
    )


SUMMARY_SYSTEM = """You are a concise technical assistant for developers.
Given document text, output a single JSON object only (no markdown fences) with this shape:
{
  "title": string (short document title or inferred topic),
  "executive_summary": string (2-4 sentences),
  "key_points": string[] (5-12 bullets, each one line),
  "sections": [ { "heading": string, "bullets": string[] } ] (2-5 sections covering structure/themes)
}
Write section headings and bullets in the same language as the document when possible (Korean if the doc is Korean)."""

QA_SYSTEM = """You answer ONLY using the provided DOCUMENT_TEXT.
If the answer cannot be found in DOCUMENT_TEXT, reply in Korean that the document does not contain enough information (do not guess from general knowledge).
Optionally include a short verbatim quote from the document as evidence when helpful.
Output JSON only (no markdown): {"answer": string, "evidence": string|null}
evidence should be a short snippet from the document or null if not applicable."""


def _client() -> OpenAI:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI()


def _truncate(text: str) -> str:
    if len(text) <= MAX_CONTEXT_CHARS:
        return text
    return text[:MAX_CONTEXT_CHARS] + "\n\n[...truncated for model context...]"


def _optional_temperature() -> dict[str, float]:
    """일부 모델(gpt-5 등)은 temperature를 1(기본)만 허용하므로, 기본은 인자를 보내지 않음."""
    raw = os.environ.get("OPENAI_TEMPERATURE", "").strip()
    if not raw:
        return {}
    try:
        return {"temperature": float(raw)}
    except ValueError:
        return {}


def generate_summary_report(extracted_text: str) -> dict[str, Any]:
    text = _truncate(extracted_text)
    client = _client()
    resp = client.chat.completions.create(
        model=_chat_model(summary=True),
        messages=[
            {"role": "system", "content": SUMMARY_SYSTEM},
            {
                "role": "user",
                "content": f"DOCUMENT:\n\n{text}",
            },
        ],
        response_format={"type": "json_object"},
        **_optional_temperature(),
    )
    raw = resp.choices[0].message.content or "{}"
    return json.loads(raw)


def answer_question(extracted_text: str, question: str) -> dict[str, Any]:
    text = _truncate(extracted_text)
    client = _client()
    resp = client.chat.completions.create(
        model=_chat_model(summary=False),
        messages=[
            {"role": "system", "content": QA_SYSTEM},
            {
                "role": "user",
                "content": f"DOCUMENT_TEXT:\n\n{text}\n\nQUESTION:\n{question}",
            },
        ],
        response_format={"type": "json_object"},
        **_optional_temperature(),
    )
    raw = resp.choices[0].message.content or "{}"
    data = json.loads(raw)
    if "answer" not in data:
        data["answer"] = str(data)
    if "evidence" not in data:
        data["evidence"] = None
    return data
