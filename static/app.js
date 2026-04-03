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
  qaForm: document.getElementById("qaForm"),
  questionInput: document.getElementById("questionInput"),
  qaSubmitBtn: document.getElementById("qaSubmitBtn"),
  qaStatus: document.getElementById("qaStatus"),
  graphRoot: document.getElementById("graphRoot"),
  inspector: document.getElementById("inspector"),
  inspectorKind: document.getElementById("inspectorKind"),
  inspectorTitle: document.getElementById("inspectorTitle"),
  inspectorBody: document.getElementById("inspectorBody"),
};

let state = loadState();
let cy = null;
let selectedNodeId = null;

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
    selectedNodeId = null;
    if (cy) cy.elements().remove();
    return;
  }
  els.placeholder.hidden = true;
  els.contentPanel.hidden = false;
  els.activeFilename.textContent = doc.original_filename || doc.document_id;
  els.activeKind.textContent = doc.source_kind;
  renderGraph(doc);
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

function labelForInspector(kind) {
  switch (kind) {
    case "doc":
      return "문서";
    case "exec":
      return "요약";
    case "keypoint":
      return "핵심 포인트";
    case "section":
      return "섹션";
    case "bullet":
      return "불릿";
    case "question":
      return "질문";
    case "answer":
      return "답변";
    case "placeholder":
      return "안내";
    default:
      return "노드";
  }
}

function shorten(s, maxLen) {
  s = String(s ?? "");
  if (s.length <= maxLen) return s;
  return s.slice(0, Math.max(0, maxLen - 1)) + "…";
}

function clearInspector() {
  els.inspectorKind.textContent = "";
  els.inspectorTitle.textContent = "선택된 노드";
  els.inspectorBody.textContent = "";
}

function setInspectorFromNodeData(doc, nodeData) {
  const kind = nodeData.kind;
  els.inspectorKind.textContent = labelForInspector(kind);

  if (kind === "doc") {
    els.inspectorTitle.textContent = doc.original_filename || doc.document_id;
    els.inspectorBody.textContent = "노드를 클릭해서 내용을 확인할 수 있습니다.";
    return;
  }

  if (kind === "placeholder") {
    els.inspectorTitle.textContent = "그래프 준비 중";
    els.inspectorBody.textContent = "먼저 ‘요약·리포트 생성’을 실행하세요.";
    return;
  }

  if (kind === "exec") {
    els.inspectorTitle.textContent = "Executive Summary";
    els.inspectorBody.textContent = nodeData.execText || "";
    return;
  }

  if (kind === "keypoint") {
    els.inspectorTitle.textContent = "핵심 포인트";
    els.inspectorBody.textContent = nodeData.keypointText || nodeData.label || "";
    return;
  }

  if (kind === "section") {
    els.inspectorTitle.textContent = nodeData.heading || nodeData.label || "섹션";
    if (nodeData.expanded === "true") {
      const bullets = String(nodeData.bulletsText || "")
        .split("\n")
        .filter((x) => x.trim().length > 0);
      els.inspectorBody.textContent = bullets.map((b) => `- ${b}`).join("\n");
    } else {
      els.inspectorBody.textContent = "불릿이 접혀 있습니다. 이 노드를 다시 클릭하면 펼쳐집니다.";
    }
    return;
  }

  if (kind === "bullet") {
    els.inspectorTitle.textContent = "불릿";
    els.inspectorBody.textContent = nodeData.bulletText || nodeData.label || "";
    return;
  }

  if (kind === "question") {
    els.inspectorTitle.textContent = "질문";
    els.inspectorBody.textContent = nodeData.questionText || nodeData.label || "";
    return;
  }

  if (kind === "answer") {
    els.inspectorTitle.textContent = "답변";
    const evidence = nodeData.evidence ? String(nodeData.evidence) : "";
    els.inspectorBody.textContent = evidence
      ? `${String(nodeData.answerText || "")}\n\n근거: ${evidence}`
      : String(nodeData.answerText || "");
    return;
  }

  els.inspectorTitle.textContent = "선택된 노드";
  els.inspectorBody.textContent = "";
}

function buildGraphElements(doc) {
  const r = doc.summary_report;
  const expanded = new Set(doc.graph_ui?.expanded_sections || []);
  const turns = doc.qa_turns || [];

  const nodes = [];
  const edges = [];

  // Manual “timeline” positioning.
  const gapX = 230;
  const baseY = 0;
  const laneStep = 170;
  const lane = (i) => ((i % 3) - 1) * laneStep;

  const docId = `doc:${doc.document_id}`;
  nodes.push({
    data: { id: docId, kind: "doc", label: doc.original_filename || doc.document_id },
    position: { x: 0, y: baseY },
  });

  let anchorId = docId;
  let xCursor = gapX;

  if (!r) {
    const phId = "placeholder:summary";
    nodes.push({
      data: { id: phId, kind: "placeholder", label: "요약 생성 필요" },
      position: { x: xCursor, y: baseY },
    });
    edges.push({ data: { id: `e:${docId}:to:${phId}`, source: docId, target: phId } });
    return { nodes, edges };
  }

  const execId = "exec:0";
  nodes.push({
    data: {
      id: execId,
      kind: "exec",
      label: "Executive Summary",
      execText: r.executive_summary || "",
    },
    position: { x: xCursor, y: baseY },
  });
  edges.push({ data: { id: `e:${docId}:to:${execId}`, source: docId, target: execId } });
  let prevId = execId;
  xCursor += gapX;

  const keyPoints = Array.isArray(r.key_points) ? r.key_points : [];
  for (let i = 0; i < keyPoints.length; i++) {
    const kpId = `kp:${i}`;
    const t = String(keyPoints[i] ?? "");
    nodes.push({
      data: { id: kpId, kind: "keypoint", label: shorten(t, 44), keypointText: t },
      position: { x: xCursor, y: lane(i) },
    });
    edges.push({ data: { id: `e:${prevId}:to:${kpId}`, source: prevId, target: kpId } });
    prevId = kpId;
    xCursor += gapX;
  }

  const sections = Array.isArray(r.sections) ? r.sections : [];
  for (let i = 0; i < sections.length; i++) {
    const secId = `sec:${i}`;
    const s = sections[i] || {};
    const heading = String(s.heading ?? "");
    const bullets = Array.isArray(s.bullets) ? s.bullets : [];
    const isExpanded = expanded.has(secId);
    nodes.push({
      data: {
        id: secId,
        kind: "section",
        label: shorten(heading || `섹션 ${i + 1}`, 36),
        heading,
        bulletsText: bullets.map((b) => String(b ?? "")).join("\n"),
        expanded: isExpanded ? "true" : "false",
      },
      position: { x: xCursor, y: lane(i + 10) },
    });
    edges.push({ data: { id: `e:${prevId}:to:${secId}`, source: prevId, target: secId } });
    prevId = secId;

    if (isExpanded) {
      for (let j = 0; j < bullets.length; j++) {
        const bId = `b:${i}:${j}`;
        const bt = String(bullets[j] ?? "");
        nodes.push({
          data: { id: bId, kind: "bullet", label: shorten(bt, 38), bulletText: bt },
          position: { x: xCursor + 18, y: lane(i + 10) + (j + 1) * 78 },
        });
        edges.push({ data: { id: `e:${secId}:to:${bId}`, source: secId, target: bId } });
      }
    }

    xCursor += gapX;
  }

  anchorId = prevId;

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i] || {};
    const qId = `q:${i}`;
    const aId = `a:${i}`;
    const question = String(t.question ?? "");
    const answer = String(t.answer ?? "");
    const evidence = t.evidence ? String(t.evidence) : null;

    nodes.push({
      data: {
        id: qId,
        kind: "question",
        label: shorten(question ? `Q: ${question}` : "질문", 52),
        questionText: question,
      },
      position: { x: xCursor, y: lane(i + 30) },
    });
    nodes.push({
      data: {
        id: aId,
        kind: "answer",
        label: "A",
        answerText: answer,
        evidence,
      },
      position: { x: xCursor, y: lane(i + 30) + 170 },
    });
    edges.push({ data: { id: `e:${anchorId}:to:${qId}`, source: anchorId, target: qId } });
    edges.push({ data: { id: `e:${qId}:to:${aId}`, source: qId, target: aId } });

    anchorId = aId;
    xCursor += gapX;
  }

  return { nodes, edges };
}

function ensureCy() {
  if (cy) return;
  cy = cytoscape({
    container: els.graphRoot,
    elements: [],
    style: [
      {
        selector: "node",
        style: {
          "background-color": "#b94cff",
          "border-color": "rgba(185, 76, 255, 0.9)",
          "border-width": 1,
          "shape": "round-rectangle",
          "label": "data(label)",
          "color": "#ffffff",
          "font-size": 10,
          "text-wrap": "wrap",
          "text-max-width": 160,
          "text-halign": "center",
          "text-valign": "center",
          "padding": 10,
          "shadow-blur": 18,
          "shadow-color": "rgba(185, 76, 255, 0.45)",
          "shadow-offset-x": 0,
          "shadow-offset-y": 0,
          "transition-property": "background-color, border-color, shadow-blur, shadow-color",
          "transition-duration": "180ms",
        },
      },
      {
        selector: 'node[kind="doc"]',
        style: {
          "background-color": "rgba(91,159,212,0.25)",
          "border-color": "rgba(91,159,212,0.9)",
          "shadow-color": "rgba(91,159,212,0.35)",
          "shadow-blur": 22,
          "font-weight": 700,
        },
      },
      {
        selector: 'node[kind="exec"]',
        style: {
          "background-color": "rgba(212, 107, 255, 0.35)",
          "border-color": "rgba(212, 107, 255, 0.95)",
          "shadow-color": "rgba(212, 107, 255, 0.45)",
        },
      },
      {
        selector: 'node[kind="keypoint"]',
        style: {
          "background-color": "rgba(185, 76, 255, 0.2)",
          "border-color": "rgba(185, 76, 255, 0.85)",
        },
      },
      {
        selector: 'node[kind="section"]',
        style: {
          "background-color": "rgba(255, 110, 208, 0.18)",
          "border-color": "rgba(255, 110, 208, 0.85)",
          "shadow-color": "rgba(255, 110, 208, 0.35)",
          "shadow-blur": 22,
        },
      },
      {
        selector: 'node[kind="bullet"]',
        style: {
          "background-color": "rgba(185, 76, 255, 0.12)",
          "border-color": "rgba(185, 76, 255, 0.6)",
          "font-size": 9,
          "text-max-width": 140,
          "shadow-blur": 10,
        },
      },
      {
        selector: 'node[kind="question"]',
        style: {
          "shape": "ellipse",
          "background-color": "rgba(91, 159, 212, 0.22)",
          "border-color": "rgba(91, 159, 212, 0.95)",
          "shadow-color": "rgba(91, 159, 212, 0.35)",
        },
      },
      {
        selector: 'node[kind="answer"]',
        style: {
          "shape": "ellipse",
          "background-color": "rgba(255, 110, 208, 0.20)",
          "border-color": "rgba(255, 110, 208, 0.95)",
          "shadow-color": "rgba(255, 110, 208, 0.38)",
        },
      },
      {
        selector: 'node[kind="placeholder"]',
        style: {
          "background-color": "rgba(139, 156, 179, 0.15)",
          "border-color": "rgba(139, 156, 179, 0.7)",
          "shadow-color": "rgba(139, 156, 179, 0.1)",
          "shadow-blur": 0,
          "color": "#e7ecf3",
        },
      },
      {
        selector: "node:selected",
        style: {
          "shadow-blur": 32,
          "shadow-color": "rgba(255, 110, 208, 0.55)",
          "border-color": "rgba(255, 110, 208, 0.95)",
        },
      },
      {
        selector: "edge",
        style: {
          "curve-style": "bezier",
          "target-arrow-shape": "none",
          "line-color": "rgba(185, 76, 255, 0.35)",
          "width": 2,
          "shadow-blur": 0,
          "opacity": 0.9,
          "transition-property": "line-color, opacity, width",
          "transition-duration": "180ms",
        },
      },
    ],
    maxZoom: 4,
    minZoom: 0.2,
    boxSelectionEnabled: true,
    autoungrabify: true,
    userZoomingEnabled: true,
    userPanningEnabled: true,
  });

  cy.on("tap", "node", (evt) => {
    const node = evt.target;
    selectedNodeId = node.id();
    const nodeData = node.data();

    if (nodeData.kind === "section") {
      const doc = findDoc(state, state.active_document_id);
      if (!doc) return;
      if (!doc.graph_ui) doc.graph_ui = { expanded_sections: [] };
      if (!Array.isArray(doc.graph_ui.expanded_sections)) doc.graph_ui.expanded_sections = [];

      const secId = nodeData.id;
      const idx = doc.graph_ui.expanded_sections.indexOf(secId);
      if (idx >= 0) doc.graph_ui.expanded_sections.splice(idx, 1);
      else doc.graph_ui.expanded_sections.push(secId);
      doc.updated_at = new Date().toISOString();
      saveState(state);

      renderGraph(doc);
      return;
    }

    const doc = findDoc(state, state.active_document_id);
    if (!doc) return;
    setInspectorFromNodeData(doc, nodeData);
  });

  window.addEventListener("resize", () => {
    if (!cy) return;
    cy.resize();
    cy.fit(40);
  });
}

function renderGraph(doc) {
  ensureCy();
  clearInspector();

  const { nodes, edges } = buildGraphElements(doc);
  cy.elements().remove();
  cy.add({ nodes, edges });
  cy.fit(70);

  if (selectedNodeId) {
    const n = cy.getElementById(selectedNodeId);
    if (n && n.nonempty()) {
      n.select();
      setInspectorFromNodeData(doc, n.data());
      return;
    }
  }

  const docNode = cy.getElementById(`doc:${doc.document_id}`);
  if (docNode && docNode.nonempty()) {
    selectedNodeId = docNode.id();
    docNode.select();
    setInspectorFromNodeData(doc, docNode.data());
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
    graph_ui: { expanded_sections: [] },
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
  clearInspector();
  selectedNodeId = null;
  if (cy) cy.elements().remove();
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
    renderGraph(doc);
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
  els.qaSubmitBtn.disabled = true;
  els.qaStatus.textContent = "답변 생성 중…";
  const res = await fetch("/api/qa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extracted_text: doc.extracted_text, question: q }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail) || "Q&A 실패");
    els.qaSubmitBtn.disabled = false;
    els.qaStatus.textContent = "";
    return;
  }
  if (!doc.qa_turns) doc.qa_turns = [];
  const nextIdx = doc.qa_turns.length;
  doc.qa_turns.push({
    question: q,
    answer: data.answer || "",
    evidence: data.evidence || null,
  });
  doc.updated_at = new Date().toISOString();
  saveState(state);
  selectedNodeId = `a:${nextIdx}`;
  renderGraph(doc);
  els.qaStatus.textContent = "완료";
  els.qaSubmitBtn.disabled = false;
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
