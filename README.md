# LocalDocAssistant

`seed.yaml` 기준 MVP: **localhost**에서 PDF·`.txt` 업로드 → 텍스트 추출 → **요약·리포트** → **문서 범위 Q&A**. 문서 목록·요약·대화는 브라우저 **localStorage**에만 저장됩니다.

## 요구 사항

- Python 3.11+ 권장 (이 저장소는 3.14 venv로 검증)
- OpenAI API 키(요약·Q&A 시에만 필요): 환경 변수 `OPENAI_API_KEY`

## 설치

```bash
cd /Users/ibyeongchan/Desktop/dev_ai_43
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## 실행

```bash
export OPENAI_API_KEY="sk-..."   # 요약/Q&A 사용 시
uvicorn app.main:app --host 127.0.0.1 --port 8765
```

브라우저에서 **http://127.0.0.1:8765** 를 엽니다.

선택 환경 변수:

- `OPENAI_DEFAULT_MODEL` — 요약·Q&A 공통 모델(미설정 시 둘 다 아래 기본값 사용)
- `OPENAI_SUMMARY_MODEL` / `OPENAI_QA_MODEL` — 각각만 따로 지정(위보다 우선)
- `OPENAI_TEMPERATURE` — (선택) 예: `0.3`. **비우면 보내지 않음** — `gpt-5` 등은 `temperature`를 기본값(1)만 허용해, 고정값을 넣으면 400이 날 수 있습니다.
- 기본 모델은 코드의 `_DEFAULT_CHAT_MODEL` 및 위 환경 변수로 결정됩니다.

`403` / `model_not_found`이면 대시보드 **Models**에서 허용된 이름으로 `OPENAI_DEFAULT_MODEL`을 맞춥니다.

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/` | 웹 UI |
| GET | `/api/health` | 헬스 체크 |
| POST | `/api/upload` | `multipart/form-data` 필드 `file` |
| POST | `/api/summary` | JSON `{ "extracted_text": "..." }` |
| POST | `/api/qa` | JSON `{ "extracted_text": "...", "question": "..." }` |

업로드만으로는 API 키가 없어도 됩니다. 요약·Q&A는 키가 없으면 503을 반환합니다.

## 구조

- `app/main.py` — FastAPI 라우트
- `app/extract.py` — PDF(`pypdf`)·텍스트 추출
- `app/llm.py` — OpenAI Chat Completions(JSON)
- `static/` — 정적 UI
