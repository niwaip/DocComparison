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

let currentCompareId = null;

function setStatus(text) {
  statusEl.textContent = text || "就绪";
}

function renderRisks(items) {
  risksEl.innerHTML = "";
  if (!items || items.length === 0) {
    riskMetaEl.textContent = "0 条";
    return;
  }
  riskMetaEl.textContent = `${items.length} 条`;

  for (const item of items) {
    const div = document.createElement("div");
    div.className = "risk-item";
    div.dataset.level = item.level || "low";
    const icon = levelIcon(item.level || "low");
    div.innerHTML = `
      <div class="lvl">${icon}${(item.level || "low").toUpperCase()} · ${item.clauseType || "unknown"}</div>
      <div style="margin-top:6px;">${item.summary || ""}</div>
      <div class="meta">${(item.tags || []).join(", ")}</div>
    `;
    div.addEventListener("click", () => {
      const selector = item?.citations?.anchors?.blockSelector;
      if (!selector) return;
      const el = document.querySelector(selector);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.outline = "2px solid #60a5fa";
      setTimeout(() => (el.style.outline = ""), 1200);
    });
    risksEl.appendChild(div);
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
  setStatus("上传并对比中…");

  const fd = new FormData(formEl);
  fd.append("aiMode", aiModeEl.checked ? "async" : "none");

  try {
    const res = await fetch("/api/compare", { method: "POST", body: fd });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    resultEl.innerHTML = data?.diff?.diffHtml || "";
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
    submitBtn.disabled = false;
  }
});

setStatus("");
