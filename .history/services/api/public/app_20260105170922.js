const statusEl = document.getElementById("status");
const formEl = document.getElementById("form");
const submitBtn = document.getElementById("submitBtn");
const resultEl = document.getElementById("result");
const risksEl = document.getElementById("risks");
const aiModeEl = document.getElementById("aiMode");
const exportBtn = document.getElementById("exportBtn");
const pdfLink = document.getElementById("pdfLink");
const resetBtn = document.getElementById("resetBtn");
const leftFileEl = document.getElementById("leftFile");
const rightFileEl = document.getElementById("rightFile");
const leftNameEl = document.getElementById("leftName");
const rightNameEl = document.getElementById("rightName");
const compareMetaEl = document.getElementById("compareMeta");
const riskMetaEl = document.getElementById("riskMeta");
const diffOnlyEl = document.getElementById("diffOnly");
const sectionTipEl = document.getElementById("sectionTip");
const progressEl = document.getElementById("progress");
const ignoreSectionNumberEl = document.getElementById("ignoreSectionNumber");
const chunkLevelEl = document.getElementById("chunkLevel");
const riskCardEl = document.getElementById("riskCard");
const riskAreaToggleEl = document.getElementById("riskAreaToggle");

let currentCompareId = null;

function setStatus(text) {
  statusEl.textContent = text || "就绪";
}

function setRiskAreaExpanded(expanded) {
  if (!riskCardEl || !riskAreaToggleEl) return;
  if (expanded) document.body.classList.remove("risk-collapsed");
  else document.body.classList.add("risk-collapsed");
  if (expanded) riskCardEl.classList.remove("collapsed");
  else riskCardEl.classList.add("collapsed");
  riskAreaToggleEl.setAttribute("aria-expanded", expanded ? "true" : "false");
  riskAreaToggleEl.textContent = expanded ? "收起" : "展开";
}

if (riskAreaToggleEl) {
  riskAreaToggleEl.addEventListener("click", () => {
    const expanded = riskAreaToggleEl.getAttribute("aria-expanded") === "true";
    setRiskAreaExpanded(!expanded);
  });
}

setRiskAreaExpanded(false);

function setProgress(active) {
  if (!progressEl) return;
  progressEl.style.display = active ? "block" : "none";
}

function renderRisks(items) {
  setRiskAreaExpanded(false);
  risksEl.innerHTML = "";
  if (!items || items.length === 0) {
    riskMetaEl.textContent = "0 条";
    return;
  }
  riskMetaEl.textContent = `${items.length} 条`;

  for (const item of items) {
    const card = document.createElement("div");
    card.className = "risk-item";
    card.dataset.level = item.level || "low";

    const head = document.createElement("div");
    head.className = "risk-head";

    const title = document.createElement("div");
    title.className = "risk-title";
    title.innerHTML = `${levelIcon(item.level || "low")}<span class="t">${String((item.level || "low").toUpperCase())} · ${String(item.clauseType || "unknown")}</span>`;

    const actions = document.createElement("div");
    actions.className = "risk-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "mini-btn";
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.textContent = "展开";

    const locateBtn = document.createElement("button");
    locateBtn.type = "button";
    locateBtn.className = "mini-btn";
    locateBtn.textContent = "定位";

    actions.appendChild(locateBtn);
    actions.appendChild(toggleBtn);

    head.appendChild(title);
    head.appendChild(actions);

    const summary = document.createElement("div");
    summary.className = "risk-summary";
    summary.textContent = String(item.summary || "");

    const tags = document.createElement("div");
    tags.className = "meta";
    tags.textContent = Array.isArray(item.tags) ? item.tags.join(", ") : "";

    const body = document.createElement("div");
    body.className = "risk-body";
    body.hidden = true;

    const analysisK = document.createElement("div");
    analysisK.className = "k";
    analysisK.textContent = "分析";
    const analysisV = document.createElement("div");
    analysisV.textContent = String(item.analysis || "");

    const recK = document.createElement("div");
    recK.className = "k";
    recK.textContent = "建议";
    const recUl = document.createElement("ul");
    for (const r of Array.isArray(item.recommendations) ? item.recommendations : []) {
      const li = document.createElement("li");
      li.textContent = String(r);
      recUl.appendChild(li);
    }

    const qK = document.createElement("div");
    qK.className = "k";
    qK.textContent = "复核问题";
    const qUl = document.createElement("ul");
    for (const q of Array.isArray(item.questionsForReview) ? item.questionsForReview : []) {
      const li = document.createElement("li");
      li.textContent = String(q);
      qUl.appendChild(li);
    }

    body.appendChild(analysisK);
    body.appendChild(analysisV);
    if (recUl.childNodes.length > 0) {
      body.appendChild(recK);
      body.appendChild(recUl);
    }
    if (qUl.childNodes.length > 0) {
      body.appendChild(qK);
      body.appendChild(qUl);
    }

    function setExpanded(expanded) {
      body.hidden = !expanded;
      toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
      toggleBtn.textContent = expanded ? "收起" : "展开";
    }

    locateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const selector = item?.citations?.anchors?.blockSelector;
      if (!selector) return;
      const el = document.querySelector(selector);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.outline = "2px solid #60a5fa";
      setTimeout(() => (el.style.outline = ""), 1200);
    });

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setExpanded(body.hidden);
    });

    head.addEventListener("click", () => setExpanded(body.hidden));

    card.appendChild(head);
    card.appendChild(summary);
    if (tags.textContent) card.appendChild(tags);
    card.appendChild(body);
    risksEl.appendChild(card);
  }
}

function levelIcon(level) {
  if (level === "high") {
    return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l10 18H2L12 2zm-1 6v6h2V8h-2zm0 8v2h2v-2h-2z"/></svg>`;
  }
  if (level === "medium") {
    return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm1-6v2h-2v-2h2zm0-10v8h-2V6h2z"/></svg>`;
  }
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z"/></svg>`;
}

function updateSectionTip(meta) {
  const n = meta?.sectionNumberChangedRows;
  if (!sectionTipEl) return;
  if (!n) {
    sectionTipEl.style.display = "none";
    sectionTipEl.textContent = "";
    return;
  }
  sectionTipEl.style.display = "block";
  sectionTipEl.textContent = `提示：为方便识别新增/删除，已优先按“内容”对齐，忽略章节号/目录页码差异。检测到章节号变化 ${n} 处（不计入差异）。`;
}

async function fetchCompare(compareId) {
  const res = await fetch(`/api/compare/${encodeURIComponent(compareId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function pollAi(compareId) {
  for (;;) {
    const data = await fetchCompare(compareId);
    if (data?.ai?.status === "done" || data?.ai?.status === "failed" || data?.ai?.status === "cancelled") {
      return data;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

async function pollPdf(compareId) {
  for (;;) {
    const data = await fetchCompare(compareId);
    const st = data?.export?.pdf?.status;
    if (st === "done" || st === "failed") return data;
    await new Promise((r) => setTimeout(r, 800));
  }
}

function updateFileLabel(inputEl, nameEl, fallback) {
  const f = inputEl?.files?.[0];
  nameEl.textContent = f ? f.name : fallback;
}

leftFileEl.addEventListener("change", () => updateFileLabel(leftFileEl, leftNameEl, "旧版本（点击选择 .docx）"));
rightFileEl.addEventListener("change", () => updateFileLabel(rightFileEl, rightNameEl, "新版本（点击选择 .docx）"));

diffOnlyEl.addEventListener("change", () => {
  if (diffOnlyEl.checked) resultEl.classList.add("diff-only");
  else resultEl.classList.remove("diff-only");
});

function resetUi() {
  formEl.reset();
  updateFileLabel(leftFileEl, leftNameEl, "旧版本（点击选择 .docx）");
  updateFileLabel(rightFileEl, rightNameEl, "新版本（点击选择 .docx）");
  resultEl.innerHTML = "";
  risksEl.innerHTML = "";
  compareMetaEl.textContent = "";
  riskMetaEl.textContent = "";
  setRiskAreaExpanded(false);
  updateSectionTip(null);
  setProgress(false);
  currentCompareId = null;
  exportBtn.disabled = true;
  pdfLink.style.display = "none";
  diffOnlyEl.checked = false;
  resultEl.classList.remove("diff-only");
  setStatus("");
}

resetBtn.addEventListener("click", () => resetUi());

exportBtn.addEventListener("click", async () => {
  if (!currentCompareId) return;
  exportBtn.disabled = true;
  pdfLink.style.display = "none";
  setProgress(true);
  setStatus("PDF 导出中…");
  try {
    const res = await fetch(`/api/compare/${encodeURIComponent(currentCompareId)}/export/pdf`, { method: "POST" });
    if (!res.ok) throw new Error(await res.text());
    const finalData = await pollPdf(currentCompareId);
    if (finalData?.export?.pdf?.status === "done" && finalData?.artifacts?.comparePdfUrl) {
      pdfLink.href = finalData.artifacts.comparePdfUrl;
      pdfLink.style.display = "inline-flex";
      setStatus("PDF 已生成");
    } else {
      setStatus(`PDF：${finalData?.export?.pdf?.status || "failed"}`);
    }
  } catch (err) {
    setStatus(`导出失败：${err?.message || String(err)}`);
  } finally {
    setProgress(false);
    exportBtn.disabled = false;
  }
});

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  resultEl.innerHTML = "";
  risksEl.innerHTML = "";
  compareMetaEl.textContent = "";
  riskMetaEl.textContent = "";
  exportBtn.disabled = true;
  pdfLink.style.display = "none";
  currentCompareId = null;
  setProgress(true);
  setStatus("上传并对比中…");

  const fd = new FormData(formEl);
  fd.append("aiMode", aiModeEl.checked ? "async" : "none");
  if (ignoreSectionNumberEl) {
    fd.set("ignoreSectionNumber", ignoreSectionNumberEl.checked ? "1" : "0");
  }
  if (chunkLevelEl) {
    const v = String(chunkLevelEl.value || "2").trim();
    fd.set("chunkLevel", v === "1" ? "1" : "2");
  }

  try {
    const res = await fetch("/api/compare", { method: "POST", body: fd });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    resultEl.innerHTML = data?.diff?.diffHtml || "";
    updateSectionTip(data?.diff?.meta);
    const compareId = data?.compareId;
    currentCompareId = compareId;
    compareMetaEl.textContent = compareId ? `ID ${compareId.slice(-8)}` : "";
    exportBtn.disabled = !compareId;

    if (data?.ai?.mode === "async" && data?.ai?.status === "pending") {
      setStatus("AI 分析中…");
      const finalData = await pollAi(compareId);
      const items = finalData?.ai?.result?.items || [];
      renderRisks(items);
      setStatus(finalData?.ai?.status === "done" ? "完成" : `AI：${finalData?.ai?.status}`);
    } else {
      const items = data?.ai?.result?.items || [];
      renderRisks(items);
      setStatus("完成");
    }
  } catch (err) {
    setStatus(`失败：${err?.message || String(err)}`);
  } finally {
    setProgress(false);
    submitBtn.disabled = false;
  }
});

setStatus("");
