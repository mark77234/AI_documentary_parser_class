import pytest


from app.extract import detect_kind, extract_from_bytes


def test_detect_kind_pdf_txt_case_insensitive():
    assert detect_kind("file.PDF") == "pdf"
    assert detect_kind("file.txt") == "txt"
    assert detect_kind("unknown.doc") is None


def test_extract_from_bytes_txt_utf8():
    assert extract_from_bytes(b"hello world", "txt") == "hello world"


def test_extract_from_bytes_unsupported_kind_raises():
    with pytest.raises(ValueError):
        extract_from_bytes(b"abc", "csv")  # type: ignore[arg-type]


def test_extract_from_bytes_pdf_joins_pages(monkeypatch):
    # PdfReader를 실제로 돌리지 않고, 페이지 추출 결과만 시뮬레이션
    import app.extract as extract_mod

    class StubPage:
        def __init__(self, text):
            self._text = text

        def extract_text(self):
            return self._text

    class StubPdfReader:
        def __init__(self, _stream):
            self.pages = [StubPage("A"), StubPage(None), StubPage("B")]

    monkeypatch.setattr(extract_mod, "PdfReader", StubPdfReader)

    out = extract_from_bytes(b"%PDF-1.4 fake", "pdf")
    assert out == "A\n\nB"


def test_extract_from_bytes_pdf_empty_pages(monkeypatch):
    import app.extract as extract_mod

    class StubPage:
        def extract_text(self):
            return None

    class StubPdfReader:
        def __init__(self, _stream):
            self.pages = [StubPage()]

    monkeypatch.setattr(extract_mod, "PdfReader", StubPdfReader)

    out = extract_from_bytes(b"%PDF-1.4 fake", "pdf")
    assert out == ""

