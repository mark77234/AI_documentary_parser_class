import asyncio
from contextlib import asynccontextmanager
from typing import Any

import httpx
from httpx import ASGITransport

import app.main as main_mod


def _run(coro):
    return asyncio.run(coro)


@asynccontextmanager
async def _client():
    transport = ASGITransport(app=main_mod.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def test_health():
    async def inner():
        async with _client() as c:
            resp = await c.get("/api/health")
            assert resp.status_code == 200
            assert resp.json() == {"ok": True}

    _run(inner())


def test_upload_rejects_unsupported_extension():
    async def inner():
        async with _client() as c:
            resp = await c.post(
                "/api/upload",
                files={"file": ("doc.doc", b"abc", "application/msword")},
            )
            assert resp.status_code == 400
            assert resp.json()["detail"] == "지원 형식은 .pdf, .txt 만입니다."

    _run(inner())


def test_upload_rejects_empty_file():
    async def inner():
        async with _client() as c:
            resp = await c.post(
                "/api/upload",
                files={"file": ("a.txt", b"", "text/plain")},
            )
            assert resp.status_code == 400
            assert resp.json()["detail"] == "빈 파일입니다."

    _run(inner())


def test_upload_extract_failure_returns_422(monkeypatch):
    async def inner():
        monkeypatch.setattr(main_mod, "extract_from_bytes", lambda _raw, _kind: (_ for _ in ()).throw(Exception("boom")))
        async with _client() as c:
            resp = await c.post("/api/upload", files={"file": ("a.pdf", b"%PDF-1.4 fake", "application/pdf")})
            assert resp.status_code == 422
            assert "텍스트 추출 실패" in resp.json()["detail"]
            assert "boom" in resp.json()["detail"]

    _run(inner())


def test_upload_success_txt(monkeypatch):
    async def inner():
        monkeypatch.setattr(main_mod, "extract_from_bytes", lambda _raw, _kind: "HELLO")
        async with _client() as c:
            resp = await c.post("/api/upload", files={"file": ("a.txt", b"anything", "text/plain")})
            assert resp.status_code == 200
            data: dict[str, Any] = resp.json()
            assert data["source_kind"] == "txt"
            assert data["extracted_text"] == "HELLO"
            assert isinstance(data["document_id"], str)

    _run(inner())


def test_summary_rejects_blank_text_explicit(monkeypatch):
    async def inner():
        monkeypatch.setattr(
            main_mod.llm,
            "generate_summary_report",
            lambda _t: (_ for _ in ()).throw(AssertionError("should not call")),
        )
        async with _client() as c:
            resp = await c.post("/api/summary", json={"extracted_text": "   "})
            assert resp.status_code == 400
            assert resp.json()["detail"] == "추출된 텍스트가 비어 있습니다."

    _run(inner())


def test_summary_runtime_error_returns_503(monkeypatch):
    async def inner():
        monkeypatch.setattr(main_mod.llm, "generate_summary_report", lambda _t: (_ for _ in ()).throw(RuntimeError("no key")))
        async with _client() as c:
            resp = await c.post("/api/summary", json={"extracted_text": "doc"})
            assert resp.status_code == 503
            assert resp.json()["detail"] == "no key"

    _run(inner())


def test_summary_missing_openai_api_key_returns_503(monkeypatch):
    async def inner():
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        async with _client() as c:
            resp = await c.post("/api/summary", json={"extracted_text": "doc"})
            assert resp.status_code == 503
            assert resp.json()["detail"] == "OPENAI_API_KEY is not set"

    _run(inner())


def test_summary_exception_returns_502(monkeypatch):
    async def inner():
        monkeypatch.setattr(main_mod.llm, "generate_summary_report", lambda _t: (_ for _ in ()).throw(ValueError("bad")))
        async with _client() as c:
            resp = await c.post("/api/summary", json={"extracted_text": "doc"})
            assert resp.status_code == 502
            assert "요약 생성 실패" in resp.json()["detail"]

    _run(inner())


def test_qa_strips_question(monkeypatch):
    async def inner():
        seen = {"question": None}

        def stub(extracted_text: str, question: str):
            seen["question"] = question
            return {"answer": "A", "evidence": "E"}

        monkeypatch.setattr(main_mod.llm, "answer_question", stub)

        async with _client() as c:
            resp = await c.post(
                "/api/qa",
                json={"extracted_text": "doc", "question": "  q?  "},
            )
            assert resp.status_code == 200
            assert resp.json() == {"answer": "A", "evidence": "E"}
            assert seen["question"] == "q?"

    _run(inner())


def test_qa_rejects_blank_extracted_text(monkeypatch):
    async def inner():
        monkeypatch.setattr(
            main_mod.llm,
            "answer_question",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("should not call")),
        )
        async with _client() as c:
            resp = await c.post("/api/qa", json={"extracted_text": "   ", "question": "q"})
            assert resp.status_code == 400
            assert resp.json()["detail"] == "추출된 텍스트가 비어 있습니다."

    _run(inner())


def test_qa_rejects_blank_question(monkeypatch):
    async def inner():
        monkeypatch.setattr(
            main_mod.llm,
            "answer_question",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("should not call")),
        )
        async with _client() as c:
            resp = await c.post("/api/qa", json={"extracted_text": "doc", "question": "   "})
            assert resp.status_code == 400
            assert resp.json()["detail"] == "질문이 비어 있습니다."

    _run(inner())


def test_qa_runtime_error_returns_503(monkeypatch):
    async def inner():
        monkeypatch.setattr(main_mod.llm, "answer_question", lambda _t, _q: (_ for _ in ()).throw(RuntimeError("no key")))
        async with _client() as c:
            resp = await c.post("/api/qa", json={"extracted_text": "doc", "question": "q"})
            assert resp.status_code == 503
            assert resp.json()["detail"] == "no key"

    _run(inner())


def test_qa_missing_openai_api_key_returns_503(monkeypatch):
    async def inner():
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        async with _client() as c:
            resp = await c.post("/api/qa", json={"extracted_text": "doc", "question": "q"})
            assert resp.status_code == 503
            assert resp.json()["detail"] == "OPENAI_API_KEY is not set"

    _run(inner())


def test_qa_exception_returns_502(monkeypatch):
    async def inner():
        monkeypatch.setattr(main_mod.llm, "answer_question", lambda _t, _q: (_ for _ in ()).throw(ValueError("bad")))
        async with _client() as c:
            resp = await c.post("/api/qa", json={"extracted_text": "doc", "question": "q"})
            assert resp.status_code == 502
            assert "답변 생성 실패" in resp.json()["detail"]

    _run(inner())

