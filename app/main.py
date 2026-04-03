"""LocalDocAssistant — localhost 문서 요약·Q&A 서버."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.extract import detect_kind, extract_from_bytes
from app import llm

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"

app = FastAPI(title="LocalDocAssistant", version="1.0.0")


class SummaryRequest(BaseModel):
    extracted_text: str = Field(..., min_length=1)


class QARequest(BaseModel):
    extracted_text: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1)


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)) -> dict:
    if not file.filename:
        raise HTTPException(400, "파일 이름이 없습니다.")
    kind = detect_kind(file.filename)
    if kind is None:
        raise HTTPException(400, "지원 형식은 .pdf, .txt 만입니다.")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "빈 파일입니다.")
    try:
        text = extract_from_bytes(raw, kind)
    except Exception as e:
        raise HTTPException(422, f"텍스트 추출 실패: {e}") from e
    if not text.strip():
        raise HTTPException(422, "추출된 텍스트가 비어 있습니다. 스캔 PDF 등일 수 있습니다.")
    doc_id = str(uuid.uuid4())
    return {
        "document_id": doc_id,
        "source_kind": kind,
        "extracted_text": text,
        "original_filename": file.filename,
    }


@app.post("/api/summary")
async def summary(body: SummaryRequest) -> dict:
    try:
        report = llm.generate_summary_report(body.extracted_text)
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e
    except Exception as e:
        raise HTTPException(502, f"요약 생성 실패: {e}") from e
    return {"summary_report": report}


@app.post("/api/qa")
async def qa(body: QARequest) -> dict:
    try:
        out = llm.answer_question(body.extracted_text, body.question.strip())
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e
    except Exception as e:
        raise HTTPException(502, f"답변 생성 실패: {e}") from e
    return {
        "answer": out.get("answer", ""),
        "evidence": out.get("evidence"),
    }


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True}


@app.get("/")
async def index() -> FileResponse:
    index_path = STATIC / "index.html"
    if not index_path.is_file():
        raise HTTPException(500, "static/index.html 없음")
    return FileResponse(index_path)


if STATIC.is_dir():
    app.mount("/assets", StaticFiles(directory=str(STATIC)), name="assets")
