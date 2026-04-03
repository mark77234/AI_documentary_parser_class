const STORAGE_KEY = "local_doc_assistant_v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, documents: [], active_document_id: null };
    const data = JSON.parse(raw);
    if (!Array.isArray(data.documents)) data.documents = [];
    return data;
  } catch {
    return { version: 1, documents: [], active_document_id: null };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function findDoc(state, id) {
  return state.documents.find((d) => d.document_id === id) || null;
}

const els = {
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  uploadError: document.getElementById("uploadError"),
  docList: document.getElementById("docList"),
  clearAll: document.getElementById("clearAll"),
  contentPanel: document.getElementById("contentPanel"),
  placeholder: document.getElementById("placeholder"),
  activeFilename: document.getElementById("activeFilename"),
  activeKind: document.getElementById("activeKind"),
  btnSummary: document.getElementById("btnSummary"),
  summaryStatus: document.getElementById("summaryStatus"),
  reportRoot: document.getElementById("reportRoot"),
  qaForm: document.getElementById("qaForm"),
  questionInput: document.getElementById("questionInput"),
  qaLog: document.getElementById("qaLog"),
};

let state = loadState();

function setUploadError(msg) {
  if (!msg) {
    els.uploadError.hidden = true;
    els.uploadError.textContent = "";
  } else {
    els.uploadError.hidden = false;
    els.uploadError.textContent = msg;
  }
}

function renderDocList() {
  els.docList.innerHTML = "";
  for (const d of state.documents) {
    const li = document.createElement("li");
    li.className = d.document_id === state.active_document_id ? "active" : "";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = d.original_filename || d.document_id.slice(0, 8);
    li.appendChild(name);
    li.addEventListener("click", () => selectDocument(d.document_id));
    els.docList.appendChild(li);
  }
}

function selectDocument(id) {
  state.active_document_id = id;
  saveState(state);
  renderDocList();
  const doc = findDoc(state, id);
  if (!doc) {
    els.contentPanel.hidden = true;
    els.placeholder.hidden = false;
    return;
  }
  els.placeholder.hidden = true;
  els.contentPanel.hidden = false;
  els.activeFilename.textContent = doc.original_filename || doc.document_id;
  els.activeKind.textContent = doc.source_kind;
  renderReport(doc);
  renderQa(doc);
}

function renderReport(doc) {
  if (!doc.summary_report) {
    els.reportRoot.hidden = true;
    els.reportRoot.innerHTML = "";
    return;
  }
  const r = doc.summary_report;
  els.reportRoot.hidden = false;
  const parts = [];
  parts.push(`<h2 class="r-title">${escapeHtml(r.title || "요약")}</h2>`);
  if (r.executive_summary) {
    parts.push(`<p class="exec">${escapeHtml(r.executive_summary)}</p>`);
  }
  if (Array.isArray(r.key_points) && r.key_points.length) {
    parts.push("<ul class=\"kp\">");
    for (const k of r.key_points) {
      parts.push(`<li>${escapeHtml(String(k))}</li>`);
    }
    parts.push("</ul>");
  }
  if (Array.isArray(r.sections)) {
    for (const s of r.sections) {
      parts.push('<div class="sec">');
      parts.push(`<h3>${escapeHtml(s.heading || "")}</h3>`);
      if (Array.isArray(s.bullets)) {
        parts.push("<ul class=\"kp\">");
        for (const b of s.bullets) {
          parts.push(`<li>${escapeHtml(String(b))}</li>`);
        }
        parts.push("</ul>");
      }
      parts.push("</div>");
    }
  }
  els.reportRoot.innerHTML = parts.join("");
}

function renderQa(doc) {
  els.qaLog.innerHTML = "";
  const turns = doc.qa_turns || [];
  for (const t of turns) {
    const div = document.createElement("div");
    div.className = "turn";
    div.innerHTML = `
      <div class="q">Q. ${escapeHtml(t.question)}</div>
      <div class="a">${escapeHtml(t.answer)}</div>
      ${t.evidence ? `<div class="ev">근거: ${escapeHtml(t.evidence)}</div>` : ""}
    `;
    els.qaLog.appendChild(div);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function uploadFile(file) {
  setUploadError("");
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || res.statusText || "업로드 실패");
  }
  const doc = {
    document_id: data.document_id,
    source_kind: data.source_kind,
    extracted_text: data.extracted_text,
    original_filename: data.original_filename,
    summary_report: null,
    qa_turns: [],
    updated_at: new Date().toISOString(),
  };
  state.documents = state.documents.filter((d) => d.document_id !== doc.document_id);
  state.documents.unshift(doc);
  state.active_document_id = doc.document_id;
  saveState(state);
  renderDocList();
  selectDocument(doc.document_id);
}

els.dropzone.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", async () => {
  const f = els.fileInput.files?.[0];
  els.fileInput.value = "";
  if (!f) return;
  try {
    await uploadFile(f);
  } catch (e) {
    setUploadError(e.message || String(e));
  }
});

["dragenter", "dragover"].forEach((ev) => {
  els.dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropzone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((ev) => {
  els.dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === "drop") {
      const f = e.dataTransfer?.files?.[0];
      if (f) uploadFile(f).catch((err) => setUploadError(err.message || String(err)));
    }
    els.dropzone.classList.remove("dragover");
  });
});

els.clearAll.addEventListener("click", () => {
  if (!confirm("저장된 문서와 대화를 모두 삭제할까요?")) return;
  state = { version: 1, documents: [], active_document_id: null };
  saveState(state);
  renderDocList();
  els.contentPanel.hidden = true;
  els.placeholder.hidden = false;
  els.reportRoot.hidden = true;
  els.reportRoot.innerHTML = "";
  setUploadError("");
});

els.btnSummary.addEventListener("click", async () => {
  const doc = findDoc(state, state.active_document_id);
  if (!doc) return;
  els.btnSummary.disabled = true;
  els.summaryStatus.textContent = "생성 중…";
  try {
    const res = await fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extracted_text: doc.extracted_text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail) || "요약 실패",
      );
    }
    doc.summary_report = data.summary_report;
    doc.updated_at = new Date().toISOString();
    saveState(state);
    renderReport(doc);
    els.summaryStatus.textContent = "완료";
  } catch (e) {
    els.summaryStatus.textContent = "";
    alert(e.message || String(e));
  } finally {
    els.btnSummary.disabled = false;
  }
});

els.qaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const doc = findDoc(state, state.active_document_id);
  if (!doc) return;
  const q = els.questionInput.value.trim();
  if (!q) return;
  els.questionInput.value = "";
  const res = await fetch("/api/qa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extracted_text: doc.extracted_text, question: q }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail) || "Q&A 실패");
    return;
  }
  if (!doc.qa_turns) doc.qa_turns = [];
  doc.qa_turns.push({
    question: q,
    answer: data.answer || "",
    evidence: data.evidence || null,
  });
  doc.updated_at = new Date().toISOString();
  saveState(state);
  renderQa(doc);
});

function init() {
  renderDocList();
  if (state.active_document_id && findDoc(state, state.active_document_id)) {
    selectDocument(state.active_document_id);
  } else {
    els.contentPanel.hidden = true;
    els.placeholder.hidden = false;
  }
}

init();
