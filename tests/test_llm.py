import json
import os

import pytest

import app.llm as llm_mod


def _stub_openai_client(*, content: str):
    class StubMessage:
        def __init__(self, c: str):
            self.content = c

    class StubChoice:
        def __init__(self, c: str):
            self.message = StubMessage(c)

    class StubResponse:
        def __init__(self, c: str):
            self.choices = [StubChoice(c)]

    class StubCompletions:
        def __init__(self, c: str):
            self._c = c
            self.last_kwargs = None

        def create(self, **kwargs):
            self.last_kwargs = kwargs
            return StubResponse(self._c)

    class StubChat:
        def __init__(self, c: str):
            self.completions = StubCompletions(c)

    class StubClient:
        def __init__(self, c: str):
            self.chat = StubChat(c)

    return StubClient(content)


def test_truncate_included_in_summary_prompt(monkeypatch):
    captured = {}
    long_text = "A" * (llm_mod.MAX_CONTEXT_CHARS + 10)
    content = json.dumps(
        {
            "title": "t",
            "executive_summary": "s",
            "key_points": ["k"],
            "sections": [],
        },
        ensure_ascii=False,
    )
    client = _stub_openai_client(content=content)
    monkeypatch.setattr(llm_mod, "_client", lambda: client)

    out = llm_mod.generate_summary_report(long_text)
    assert out["title"] == "t"

    kwargs = client.chat.completions.last_kwargs
    assert kwargs is not None
    # messages[1] is user content
    user_content = kwargs["messages"][1]["content"]
    assert "[...truncated for model context...]" in user_content
    assert len(user_content) < len(long_text) + 500  # sanity


def test_generate_summary_report_requires_json_object(monkeypatch):
    client = _stub_openai_client(content='["not-an-object"]')
    monkeypatch.setattr(llm_mod, "_client", lambda: client)

    with pytest.raises(ValueError, match="JSON object"):
        llm_mod.generate_summary_report("hello")


def test_answer_question_normalizes_missing_fields(monkeypatch):
    client = _stub_openai_client(content=json.dumps({"evidence": "EV"}))
    monkeypatch.setattr(llm_mod, "_client", lambda: client)

    out = llm_mod.answer_question("doc", "question")
    assert isinstance(out["answer"], str)
    assert out["evidence"] == "EV"


def test_answer_question_normalizes_string_types(monkeypatch):
    client = _stub_openai_client(content=json.dumps({"answer": 123, "evidence": 456}))
    monkeypatch.setattr(llm_mod, "_client", lambda: client)

    out = llm_mod.answer_question("doc", "question")
    assert out["answer"] == "123"
    assert out["evidence"] == "456"


def test_answer_question_requires_json_object(monkeypatch):
    client = _stub_openai_client(content="[]")
    monkeypatch.setattr(llm_mod, "_client", lambda: client)

    with pytest.raises(ValueError, match="JSON object"):
        llm_mod.answer_question("doc", "question")


def test_answer_question_invalid_json_raises(monkeypatch):
    client = _stub_openai_client(content="{not-json}")
    monkeypatch.setattr(llm_mod, "_client", lambda: client)

    with pytest.raises(json.JSONDecodeError):
        llm_mod.answer_question("doc", "question")

