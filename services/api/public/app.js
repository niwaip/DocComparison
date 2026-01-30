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
const standardTypeEl = document.getElementById("standardType");
const rulesBtn = document.getElementById("rulesBtn");
const riskCardEl = document.getElementById("riskCard");
const riskAreaToggleEl = document.getElementById("riskAreaToggle");
const confirmCardEl = document.getElementById("confirmCard");
const confirmAreaToggleEl = document.getElementById("confirmAreaToggle");
const confirmMetaEl = document.getElementById("confirmMeta");
const confirmListEl = document.getElementById("confirmList");
const confirmTipEl = document.getElementById("confirmTip");
const aiModalEl = document.getElementById("aiModal");
const aiModalContentEl = document.getElementById("aiModalContent");
const aiModalCloseEl = document.getElementById("aiModalClose");
const aiModalBackdropEl = document.getElementById("aiModalBackdrop");
const rulesModalEl = document.getElementById("rulesModal");
const rulesModalBackdropEl = document.getElementById("rulesModalBackdrop");
const rulesModalCloseEl = document.getElementById("rulesModalClose");
const rulesStandardTypeEl = document.getElementById("rulesStandardType");
const rulesTemplateFileEl = document.getElementById("rulesTemplateFile");
const rulesTemplateNameEl = document.getElementById("rulesTemplateName");
const rulesTemplatePreviewEl = document.getElementById("rulesTemplatePreview");
const rulesAnchorBarEl = document.getElementById("rulesAnchorBar");
const rulesTemplateUploadBtn = document.getElementById("rulesTemplateUploadBtn");
const rulesLoadBtn = document.getElementById("rulesLoadBtn");
const rulesSaveBtn = document.getElementById("rulesSaveBtn");
const rulesFormEl = document.getElementById("rulesForm");
const rulesPurchaseSectionEl = document.getElementById("rulesPurchaseSection");
const rulesHeadingEnabledEl = document.getElementById("rulesHeadingEnabled");
const rulesHeadingMaxLevelEl = document.getElementById("rulesHeadingMaxLevel");
const rulesPlaceholderEnabledEl = document.getElementById("rulesPlaceholderEnabled");
const rulesPlaceholderRegexEl = document.getElementById("rulesPlaceholderRegex");
const rulesDeletedEnabledEl = document.getElementById("rulesDeletedEnabled");

const rulesPurchaseEnabledEl = document.getElementById("rulesPurchaseEnabled");
const rulesPurchaseSigningEnabledEl = document.getElementById("rulesPurchaseSigningEnabled");
const rulesPurchaseSigningMinPrecisionEl = document.getElementById("rulesPurchaseSigningMinPrecision");
const rulesPurchaseBuyerEnabledEl = document.getElementById("rulesPurchaseBuyerEnabled");
const rulesPurchaseBuyerSuffixEl = document.getElementById("rulesPurchaseBuyerSuffix");
const rulesPurchaseSection1EnabledEl = document.getElementById("rulesPurchaseSection1Enabled");
const rulesPurchaseSection1KeywordsEl = document.getElementById("rulesPurchaseSection1Keywords");
const rulesPurchaseSection1UpperLowerEl = document.getElementById("rulesPurchaseSection1UpperLower");
const rulesPurchaseDeliveryAddressEnabledEl = document.getElementById("rulesPurchaseDeliveryAddressEnabled");
const rulesPurchaseDeliveryKeywordsEl = document.getElementById("rulesPurchaseDeliveryKeywords");
const rulesPurchaseDeliveryDateEnabledEl = document.getElementById("rulesPurchaseDeliveryDateEnabled");
const rulesPurchaseDeliveryMinPrecisionEl = document.getElementById("rulesPurchaseDeliveryMinPrecision");
const rulesPurchaseEndUserEnabledEl = document.getElementById("rulesPurchaseEndUserEnabled");
const rulesPurchaseEndUserSuffixEl = document.getElementById("rulesPurchaseEndUserSuffix");
const rulesPurchaseSection4EnabledEl = document.getElementById("rulesPurchaseSection4Enabled");
const rulesPurchaseSection4CurrencyEl = document.getElementById("rulesPurchaseSection4Currency");
const rulesPurchaseSection4UpperLowerEl = document.getElementById("rulesPurchaseSection4UpperLower");
const rulesPurchaseTermMaxEnabledEl = document.getElementById("rulesPurchaseTermMaxEnabled");
const rulesPurchaseTermMaxEl = document.getElementById("rulesPurchaseTermMax");
const rulesPurchaseSection8EnabledEl = document.getElementById("rulesPurchaseSection8Enabled");
const rulesPurchaseCopiesEnabledEl = document.getElementById("rulesPurchaseCopiesEnabled");
const rulesStatusEl = document.getElementById("rulesStatus");
const prevDiffBtn = document.getElementById("prevDiffBtn");
const nextDiffBtn = document.getElementById("nextDiffBtn");
const topBtn = document.getElementById("topBtn");
const diffNavMetaEl = document.getElementById("diffNavMeta");

let currentCompareId = null;
let diffNavRows = [];
let diffNavIndex = -1;
let standardTypes = [];
let isSubmitting = false;

function refreshDiffNav() {
  diffNavRows = Array.from(
    resultEl.querySelectorAll(".diff-row.kind-modified, .diff-row.kind-inserted, .diff-row.kind-deleted")
  );
  if (diffNavIndex >= diffNavRows.length) diffNavIndex = diffNavRows.length - 1;
  if (diffNavIndex < 0 && diffNavRows.length > 0) diffNavIndex = 0;
  if (diffNavMetaEl) diffNavMetaEl.textContent = diffNavRows.length ? `差异 ${diffNavIndex + 1}/${diffNavRows.length}` : "无差异";
  const enabled = diffNavRows.length > 0;
  if (prevDiffBtn) prevDiffBtn.disabled = !enabled;
  if (nextDiffBtn) nextDiffBtn.disabled = !enabled;
  if (topBtn) topBtn.disabled = !enabled;
}

function clearActiveDiff() {
  const active = resultEl.querySelectorAll(".diff-cell.active-diff-cell");
  for (const el of active) el.classList.remove("active-diff-cell");
}

function goToDiff(index) {
  if (!diffNavRows.length) return;
  const i = Math.max(0, Math.min(diffNavRows.length - 1, index));
  diffNavIndex = i;
  const row = diffNavRows[i];
  if (!row) return;
  clearActiveDiff();
  const cells = row.querySelectorAll(".diff-cell");
  for (const c of cells) c.classList.add("active-diff-cell");
  const target = row.querySelector(".diff-cell") || cells?.[0] || null;
  if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  if (diffNavMetaEl) diffNavMetaEl.textContent = `差异 ${diffNavIndex + 1}/${diffNavRows.length}`;
}

function setStatus(text) {
  statusEl.textContent = text || "就绪";
}

function setRulesStatus(text) {
  if (!rulesStatusEl) return;
  rulesStatusEl.textContent = String(text || "");
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

function setConfirmAreaExpanded(expanded) {
  if (!confirmCardEl || !confirmAreaToggleEl) return;
  if (expanded) document.body.classList.remove("risk-collapsed");
  else document.body.classList.add("risk-collapsed");
  if (expanded) confirmCardEl.classList.remove("collapsed");
  else confirmCardEl.classList.add("collapsed");
  confirmAreaToggleEl.setAttribute("aria-expanded", expanded ? "true" : "false");
  confirmAreaToggleEl.textContent = expanded ? "收起" : "展开";
}

if (riskAreaToggleEl) {
  riskAreaToggleEl.addEventListener("click", () => {
    const expanded = riskAreaToggleEl.getAttribute("aria-expanded") === "true";
    setRiskAreaExpanded(!expanded);
  });
}

setRiskAreaExpanded(false);
setConfirmAreaExpanded(false);

if (confirmAreaToggleEl) {
  confirmAreaToggleEl.addEventListener("click", () => {
    const expanded = confirmAreaToggleEl.getAttribute("aria-expanded") === "true";
    setConfirmAreaExpanded(!expanded);
  });
}

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

function renderAiReport(result) {
  setRiskAreaExpanded(false);
  risksEl.innerHTML = "";

  const sections = Array.isArray(result?.sections) ? result.sections : [];
  riskMetaEl.textContent = `整体 + ${sections.length} 章`;

  const overall = result?.overall || {};
  const overallCard = document.createElement("div");
  overallCard.className = "risk-item expanded";
  overallCard.dataset.level = "low";

  const head = document.createElement("div");
  head.className = "risk-head";

  const title = document.createElement("div");
  title.className = "risk-title";
  title.innerHTML = `${levelIcon("low")}<span class="t">整体分析</span>`;

  const actions = document.createElement("div");
  actions.className = "risk-actions";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "mini-btn";
  toggleBtn.setAttribute("aria-expanded", "true");
  toggleBtn.textContent = "收起";

  actions.appendChild(toggleBtn);
  head.appendChild(title);
  head.appendChild(actions);

  const summary = document.createElement("div");
  summary.className = "risk-summary";
  summary.textContent = String(overall.summary || "");

  const body = document.createElement("div");
  body.className = "risk-body";
  body.hidden = false;

  const riskUl = document.createElement("ul");
  for (const r of Array.isArray(overall.keyRisks) ? overall.keyRisks : []) {
    const li = document.createElement("li");
    li.textContent = String(r);
    riskUl.appendChild(li);
  }
  const sugUl = document.createElement("ul");
  for (const s of Array.isArray(overall.suggestions) ? overall.suggestions : []) {
    const li = document.createElement("li");
    li.textContent = String(s);
    sugUl.appendChild(li);
  }

  if (riskUl.childNodes.length) {
    const k = document.createElement("div");
    k.className = "k";
    k.textContent = "关键风险";
    body.appendChild(k);
    body.appendChild(riskUl);
  }
  if (sugUl.childNodes.length) {
    const k = document.createElement("div");
    k.className = "k";
    k.textContent = "建议";
    body.appendChild(k);
    body.appendChild(sugUl);
  }

  function setExpanded(expanded) {
    body.hidden = !expanded;
    toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggleBtn.textContent = expanded ? "收起" : "展开";
  }

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setExpanded(body.hidden);
  });

  head.addEventListener("click", () => setExpanded(body.hidden));

  overallCard.appendChild(head);
  if (summary.textContent) overallCard.appendChild(summary);
  overallCard.appendChild(body);
  risksEl.appendChild(overallCard);

  for (const sec of sections) {
    const card = document.createElement("div");
    card.className = "risk-item";
    card.dataset.level = "medium";

    const head2 = document.createElement("div");
    head2.className = "risk-head";

    const title2 = document.createElement("div");
    title2.className = "risk-title";
    title2.innerHTML = `${levelIcon("medium")}<span class="t">${String(sec.sectionLabel || "章节")} · 一级章节</span>`;

    const actions2 = document.createElement("div");
    actions2.className = "risk-actions";

    const locateBtn = document.createElement("button");
    locateBtn.type = "button";
    locateBtn.className = "mini-btn";
    locateBtn.textContent = "定位";

    const toggleBtn2 = document.createElement("button");
    toggleBtn2.type = "button";
    toggleBtn2.className = "mini-btn";
    toggleBtn2.setAttribute("aria-expanded", "false");
    toggleBtn2.textContent = "展开";

    actions2.appendChild(locateBtn);
    actions2.appendChild(toggleBtn2);
    head2.appendChild(title2);
    head2.appendChild(actions2);

    const summary2 = document.createElement("div");
    summary2.className = "risk-summary";
    summary2.textContent = String(sec.summary || "");

    const body2 = document.createElement("div");
    body2.className = "risk-body";
    body2.hidden = true;

    const riskUl2 = document.createElement("ul");
    for (const r of Array.isArray(sec.keyRisks) ? sec.keyRisks : []) {
      const li = document.createElement("li");
      li.textContent = String(r);
      riskUl2.appendChild(li);
    }
    const sugUl2 = document.createElement("ul");
    for (const s of Array.isArray(sec.suggestions) ? sec.suggestions : []) {
      const li = document.createElement("li");
      li.textContent = String(s);
      sugUl2.appendChild(li);
    }

    if (riskUl2.childNodes.length) {
      const k = document.createElement("div");
      k.className = "k";
      k.textContent = "关键风险";
      body2.appendChild(k);
      body2.appendChild(riskUl2);
    }
    if (sugUl2.childNodes.length) {
      const k = document.createElement("div");
      k.className = "k";
      k.textContent = "建议";
      body2.appendChild(k);
      body2.appendChild(sugUl2);
    }

    function setExpanded2(expanded) {
      body2.hidden = !expanded;
      toggleBtn2.setAttribute("aria-expanded", expanded ? "true" : "false");
      toggleBtn2.textContent = expanded ? "收起" : "展开";
    }

    locateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const ids = Array.isArray(sec.relatedBlockIds) ? sec.relatedBlockIds : [];
      const blockId = ids.find((x) => typeof x === "string" && x) || null;
      if (!blockId) return;
      const el = document.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.outline = "2px solid #60a5fa";
      setTimeout(() => (el.style.outline = ""), 1200);
    });

    toggleBtn2.addEventListener("click", (e) => {
      e.stopPropagation();
      setExpanded2(body2.hidden);
    });

    head2.addEventListener("click", () => setExpanded2(body2.hidden));

    card.appendChild(head2);
    if (summary2.textContent) card.appendChild(summary2);
    card.appendChild(body2);
    risksEl.appendChild(card);
  }
}

function renderAiResult(result) {
  if (!result) {
    renderRisks([]);
    return;
  }
  if (result.schemaVersion === "2") {
    renderAiReport(result);
    return;
  }
  renderRisks(result.items || []);
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

async function pollConfirm(compareId) {
  for (;;) {
    const data = await fetchCompare(compareId);
    const st = data?.confirm?.status;
    if (st === "done" || st === "failed" || st === "cancelled" || st === "none") return data;
    await new Promise((r) => setTimeout(r, 800));
  }
}

function updateFileLabel(inputEl, nameEl, fallback) {
  const f = inputEl?.files?.[0];
  nameEl.textContent = f ? f.name : fallback;
}

function getDocTypeId() {
  return String((standardTypeEl && standardTypeEl.value) || "").trim();
}

function applyModeUi() {
  const typeId = getDocTypeId();
  const std = standardTypes.find((t) => String(t.id) === typeId) || null;
  const typeName = std?.name || "";
  const hasTemplate = Boolean(std?.hasTemplate);
  const hasLeft = Boolean(leftFileEl?.files?.[0]);
  const hasRight = Boolean(rightFileEl?.files?.[0]);

  if (leftFileEl) leftFileEl.disabled = false;

  if (!typeId) {
    if (leftFileEl) leftFileEl.required = true;
    updateFileLabel(leftFileEl, leftNameEl, "修订前合同（点击选择 .doc/.docx/.pdf）");
    updateFileLabel(rightFileEl, rightNameEl, "修订后合同（点击选择 .doc/.docx/.pdf）");
    if (submitBtn) submitBtn.textContent = "开始对比";
    if (confirmCardEl) confirmCardEl.style.display = "none";
    if (riskCardEl) riskCardEl.style.display = "block";
    if (submitBtn && !isSubmitting) submitBtn.disabled = !(hasLeft && hasRight);
    return;
  }

  if (leftFileEl) leftFileEl.required = false;
  updateFileLabel(
    leftFileEl,
    leftNameEl,
    hasLeft ? "修订前合同（未选择文件）" : typeName ? `标准合同：${typeName}${hasTemplate ? "" : "（未上传）"}（不上传则使用标准）` : "标准合同（请选择类型）"
  );
  updateFileLabel(rightFileEl, rightNameEl, hasLeft ? "修订后合同（点击选择 .doc/.docx/.pdf）" : "待审合同（点击选择 .doc/.docx/.pdf）");

  if (submitBtn) submitBtn.textContent = hasLeft ? "开始对比并校验" : "开始审查";
  if (confirmCardEl) confirmCardEl.style.display = "block";
  if (riskCardEl) riskCardEl.style.display = hasLeft ? "block" : "none";

  if (submitBtn && !isSubmitting) {
    if (!hasRight) {
      submitBtn.disabled = true;
    } else if (!hasLeft && !hasTemplate) {
      submitBtn.disabled = true;
    } else {
      submitBtn.disabled = false;
    }
  }
}

if (rightFileEl) rightFileEl.addEventListener("change", () => applyModeUi());
if (leftFileEl) leftFileEl.addEventListener("change", () => applyModeUi());
if (standardTypeEl) standardTypeEl.addEventListener("change", () => applyModeUi());

applyModeUi();

diffOnlyEl.addEventListener("change", () => {
  if (diffOnlyEl.checked) resultEl.classList.add("diff-only");
  else resultEl.classList.remove("diff-only");
});

if (prevDiffBtn) {
  prevDiffBtn.addEventListener("click", () => {
    if (!diffNavRows.length) return;
    goToDiff(Math.max(0, diffNavIndex - 1));
  });
}
if (nextDiffBtn) {
  nextDiffBtn.addEventListener("click", () => {
    if (!diffNavRows.length) return;
    goToDiff(Math.min(diffNavRows.length - 1, diffNavIndex + 1));
  });
}
if (topBtn) {
  topBtn.addEventListener("click", () => {
    if (!diffNavRows.length) return;
    goToDiff(0);
  });
}

resultEl.addEventListener("click", async (e) => {
  const btn = e.target?.closest?.(".ai-suggest-btn");
  if (!btn) return;
  if (!currentCompareId) return;

  const rowEl = btn.closest?.(".diff-row");
  const rowId = rowEl?.getAttribute?.("data-row-id") || "";
  if (!rowId) return;

  const sel = window.getSelection ? window.getSelection() : null;
  const rawSel = sel ? String(sel.toString() || "") : "";
  let focusText = rawSel.trim();
  if (sel && focusText) {
    const a = sel.anchorNode;
    const f = sel.focusNode;
    const ok = (a && rowEl.contains(a)) || (f && rowEl.contains(f));
    if (!ok) focusText = "";
  }
  if (focusText.length > 2000) focusText = focusText.slice(0, 2000);

  btn.disabled = true;
  setProgress(true);
  setStatus("AI 差异解析中…");
  try {
    const cell = btn.closest?.(".diff-cell");
    const blockId = cell?.getAttribute?.("data-block-id") || "";
    const url = blockId
      ? `/api/compare/${encodeURIComponent(currentCompareId)}/ai/block`
      : `/api/compare/${encodeURIComponent(currentCompareId)}/ai/snippet`;
    const payload = blockId
      ? { blockId, focusText: focusText || null }
      : { rowId, focusText: focusText || null };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    openAiModal(data?.summary, data?.keyPoints, data?.risks, data?.suggestions);
  } catch (err) {
    openAiModal(`失败：${err?.message || String(err)}`, [], [], []);
  } finally {
    setProgress(false);
    btn.disabled = false;
    setStatus("");
  }
});

function resetUi() {
  formEl.reset();
  applyModeUi();
  resultEl.innerHTML = "";
  risksEl.innerHTML = "";
  if (confirmListEl) confirmListEl.innerHTML = "";
  compareMetaEl.textContent = "";
  riskMetaEl.textContent = "";
  if (confirmMetaEl) confirmMetaEl.textContent = "";
  setRiskAreaExpanded(false);
  setConfirmAreaExpanded(false);
  updateSectionTip(null);
  setProgress(false);
  currentCompareId = null;
  exportBtn.disabled = true;
  pdfLink.style.display = "none";
  diffOnlyEl.checked = false;
  resultEl.classList.remove("diff-only");
  diffNavIndex = -1;
  diffNavRows = [];
  if (diffNavMetaEl) diffNavMetaEl.textContent = "";
  if (prevDiffBtn) prevDiffBtn.disabled = true;
  if (nextDiffBtn) nextDiffBtn.disabled = true;
  if (topBtn) topBtn.disabled = true;
  setStatus("");
}

resetBtn.addEventListener("click", () => resetUi());

function openAiModal(summary, keyPoints, risks, suggestions) {
  if (!aiModalEl || !aiModalContentEl) return;
  const lines = [];
  if (summary) lines.push(`【概述】${summary}`);
  if (Array.isArray(keyPoints) && keyPoints.length) {
    lines.push("");
    lines.push("【要点】");
    for (const k of keyPoints) lines.push(`- ${k}`);
  }
  if (Array.isArray(risks) && risks.length) {
    lines.push("");
    lines.push("【风险】");
    for (const r of risks) lines.push(`- ${r}`);
  }
  if (Array.isArray(suggestions) && suggestions.length) {
    lines.push("");
    lines.push("【建议】");
    for (const s of suggestions) lines.push(`- ${s}`);
  }
  aiModalContentEl.textContent = lines.join("\n") || "暂无内容";
  aiModalEl.classList.add("open");
  aiModalEl.setAttribute("aria-hidden", "false");
}

function closeAiModal() {
  if (!aiModalEl) return;
  aiModalEl.classList.remove("open");
  aiModalEl.setAttribute("aria-hidden", "true");
}

if (aiModalCloseEl) aiModalCloseEl.addEventListener("click", closeAiModal);
if (aiModalBackdropEl) aiModalBackdropEl.addEventListener("click", closeAiModal);

function openRulesModal() {
  if (!rulesModalEl) return;
  if (rulesStandardTypeEl) {
    const prefer = String((standardTypeEl && standardTypeEl.value) || "").trim();
    if (prefer) {
      const ok = Array.from(rulesStandardTypeEl.options || []).some((o) => String(o.value || "") === prefer);
      if (ok) rulesStandardTypeEl.value = prefer;
    }
    if (!String(rulesStandardTypeEl.value || "").trim() && (rulesStandardTypeEl.options || []).length) {
      rulesStandardTypeEl.value = String(rulesStandardTypeEl.options[0]?.value || "");
    }
  }
  rulesModalEl.classList.add("open");
  rulesModalEl.setAttribute("aria-hidden", "false");
  setRulesStatus("");
  updateRulesTemplateLabel();
}

function closeRulesModal() {
  if (!rulesModalEl) return;
  rulesModalEl.classList.remove("open");
  rulesModalEl.setAttribute("aria-hidden", "true");
  setRulesStatus("");
}

async function loadStandardTypes() {
  const fill = (selectEl, opts = {}) => {
    if (!selectEl) return;
    const includeBlank = Boolean(opts.includeBlank);
    const blankLabel = String(opts.blankLabel || "任意文档比较（无规则确认）");
    const prev = String(selectEl.value || "");
    const initialLoadingOnly =
      prev === "" && selectEl.options && selectEl.options.length === 1 && /加载中/.test(String(selectEl.options[0]?.textContent || ""));
    selectEl.innerHTML = "";
    if (includeBlank) {
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = blankLabel;
      selectEl.appendChild(opt0);
    }
    for (const t of standardTypes) {
      const opt = document.createElement("option");
      opt.value = String(t.id);
      opt.textContent = t.hasTemplate ? `${t.name}` : `${t.name}（未上传）`;
      selectEl.appendChild(opt);
    }
    const values = new Set(Array.from(selectEl.options || []).map((o) => String(o.value || "")));
    if (values.has(prev)) {
      if (initialLoadingOnly && includeBlank && standardTypes.length) selectEl.value = String(standardTypes[0].id);
      else selectEl.value = prev;
    } else if (standardTypes.length) {
      selectEl.value = String(standardTypes[0].id);
    } else if (includeBlank) {
      selectEl.value = "";
    }
  };

  try {
    const res = await fetch("/api/standard-contracts/types");
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    standardTypes = Array.isArray(data?.types) ? data.types : [];
  } catch {
    standardTypes = [];
  }

  if (!standardTypes.length) {
    standardTypes = [
      { id: "std_1", name: "标准合同 1", hasTemplate: false },
      { id: "std_2", name: "标准合同 2", hasTemplate: false },
      { id: "std_3", name: "标准合同 3", hasTemplate: false },
      { id: "std_4", name: "标准合同 4", hasTemplate: false },
      { id: "std_5", name: "标准合同 5", hasTemplate: false }
    ];
  }

  fill(standardTypeEl, { includeBlank: true, blankLabel: "任意文档比较（无规则确认）" });
  fill(rulesStandardTypeEl, { includeBlank: false });
  applyModeUi();
  updateRulesTemplateLabel();
}

function updateRulesTemplateLabel() {
  if (!rulesTemplateNameEl) return;
  const f = rulesTemplateFileEl?.files?.[0] ?? null;
  if (f) {
    rulesTemplateNameEl.textContent = f.name;
    return;
  }
  const id = String((rulesStandardTypeEl && rulesStandardTypeEl.value) || "").trim();
  const std = standardTypes.find((t) => String(t.id) === id) || null;
  if (!std) {
    rulesTemplateNameEl.textContent = "上传标准合同模板（.doc/.docx/.pdf）";
    return;
  }
  rulesTemplateNameEl.textContent = std.hasTemplate ? `模板：${std.name}（已上传）` : `模板：${std.name}（未上传）`;
}

function setRulesAnchorBar(text) {
  if (!rulesAnchorBarEl) return;
  const t = String(text || "").trim();
  if (!t) {
    rulesAnchorBarEl.style.display = "none";
    rulesAnchorBarEl.textContent = "";
    return;
  }
  rulesAnchorBarEl.style.display = "inline-flex";
  rulesAnchorBarEl.textContent = t;
}

function renderRulesTemplatePreview(blocks) {
  if (!rulesTemplatePreviewEl) return;
  const list = Array.isArray(blocks) ? blocks : [];
  if (!list.length) {
    rulesTemplatePreviewEl.innerHTML = `<div style="opacity:.75;">暂无模板预览</div>`;
    return;
  }
  rulesTemplatePreviewEl.innerHTML = list
    .map((b) => {
      const blockId = String(b?.blockId || "");
      const html = String(b?.htmlFragment || "");
      const kind = String(b?.kind || "");
      const heading = kind === "heading" ? "标题" : kind === "table" ? "表格" : "段落";
      return `
        <div data-tpl-block="${blockId}" style="border:1px solid rgba(255,255,255,.10); border-radius:12px; overflow:hidden; margin-bottom:10px; background: rgba(2,6,23,.18);">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border-bottom:1px solid rgba(255,255,255,.10); background: rgba(15,23,42,.35);">
            <div class="mono" style="opacity:.85; font-size:12px;">${blockId} · ${heading}</div>
            <button class="mini-btn" type="button" data-copy-block="${blockId}">复制锚点</button>
          </div>
          <div style="padding:8px 10px;">${html}</div>
        </div>
      `;
    })
    .join("");
}

async function copyTextToClipboard(text) {
  const t = String(text || "");
  if (!t) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch {
    return false;
  }
}

async function loadRulesTemplatePreviewFor(typeId) {
  if (!rulesTemplatePreviewEl) return;
  const id = String(typeId || "").trim();
  setRulesAnchorBar("");
  if (!id) {
    renderRulesTemplatePreview([]);
    return;
  }
  const std = standardTypes.find((t) => String(t.id) === id) || null;
  if (!std || !std.hasTemplate) {
    rulesTemplatePreviewEl.innerHTML = `<div style="opacity:.75;">模板未上传</div>`;
    return;
  }
  rulesTemplatePreviewEl.innerHTML = `<div style="opacity:.75;">加载预览中…</div>`;
  try {
    const chunkLevel = String((chunkLevelEl && chunkLevelEl.value) || "2").trim() === "1" ? "1" : "2";
    const res = await fetch(`/api/standard-contracts/${encodeURIComponent(id)}/template/preview?chunkLevel=${encodeURIComponent(chunkLevel)}`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    renderRulesTemplatePreview(data?.blocks || []);
  } catch (e) {
    rulesTemplatePreviewEl.innerHTML = `<div style="opacity:.75;">预览加载失败：${String(e?.message || e)}</div>`;
  }
}

async function uploadTemplateFor(typeId) {
  const id = String(typeId || "").trim();
  const f = rulesTemplateFileEl?.files?.[0] ?? null;
  if (!id) {
    setRulesStatus("请选择标准合同");
    return;
  }
  if (!f) {
    setRulesStatus("请选择模板文件");
    return;
  }
  const fd = new FormData();
  fd.set("file", f);
  setRulesStatus("模板上传中…");
  try {
    const res = await fetch(`/api/standard-contracts/${encodeURIComponent(id)}/template`, { method: "POST", body: fd });
    if (!res.ok) throw new Error(await res.text());
    if (rulesTemplateFileEl) rulesTemplateFileEl.value = "";
    await loadStandardTypes();
    updateRulesTemplateLabel();
    await loadRulesTemplatePreviewFor(id);
    setRulesStatus("模板已上传");
  } catch (e) {
    setRulesStatus(`模板上传失败：${e?.message || String(e)}`);
  }
}

function defaultRulesObject(typeId) {
  const id = String(typeId || "").trim();
  const base = {
    schemaVersion: "1",
    heading: { enabled: true, maxLevel: 2 },
    placeholder: { enabled: true },
    deletedClause: { enabled: true }
  };
  if (id === "purchase") {
    return {
      ...base,
      purchaseContract: {
        enabled: true,
        signingDate: { enabled: true, minPrecision: "month" },
        buyerName: { enabled: true, companySuffix: "公司" },
        section1Items: { enabled: true, requiredKeywords: ["产品名称", "单价", "数量", "总价", "合计金额"], requireUpperLowerAmount: true },
        deliveryAddress: { enabled: true, requiredKeywords: ["交货地址", "联系人"] },
        deliveryDate: { enabled: true, minPrecision: "month" },
        endUserName: { enabled: true, companySuffix: "公司" },
        section4Payment: { enabled: true, requireCurrency: true, requireUpperLowerAmount: true },
        termMax: { enabled: true, max: 10 },
        section8Term: { enabled: true },
        copiesCount: { enabled: true }
      }
    };
  }
  return base;
}

function splitKeywords(text) {
  return String(text || "")
    .split(/[，,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function applyRulesTypeUi(typeId) {
  const id = String(typeId || "").trim();
  if (rulesPurchaseSectionEl) rulesPurchaseSectionEl.style.display = id === "purchase" ? "block" : "none";
}

function clampInt(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function fillRulesForm(typeId, obj) {
  const id = String(typeId || "").trim();
  const rules = obj && typeof obj === "object" ? obj : {};
  if (rulesHeadingEnabledEl) rulesHeadingEnabledEl.checked = rules?.heading?.enabled !== false;
  if (rulesHeadingMaxLevelEl) rulesHeadingMaxLevelEl.value = String(clampInt(rules?.heading?.maxLevel, 1, 6, 2));
  if (rulesPlaceholderEnabledEl) rulesPlaceholderEnabledEl.checked = rules?.placeholder?.enabled !== false;
  if (rulesPlaceholderRegexEl) rulesPlaceholderRegexEl.value = String(rules?.placeholder?.regex || "");
  if (rulesDeletedEnabledEl) rulesDeletedEnabledEl.checked = rules?.deletedClause?.enabled !== false;

  applyRulesTypeUi(id);
  if (id !== "purchase") return;

  const p = rules?.purchaseContract || {};
  if (rulesPurchaseEnabledEl) rulesPurchaseEnabledEl.checked = p?.enabled === true;

  if (rulesPurchaseSigningEnabledEl) rulesPurchaseSigningEnabledEl.checked = p?.signingDate?.enabled !== false;
  if (rulesPurchaseSigningMinPrecisionEl) rulesPurchaseSigningMinPrecisionEl.value = String(p?.signingDate?.minPrecision || "month");

  if (rulesPurchaseBuyerEnabledEl) rulesPurchaseBuyerEnabledEl.checked = p?.buyerName?.enabled !== false;
  if (rulesPurchaseBuyerSuffixEl) rulesPurchaseBuyerSuffixEl.value = String(p?.buyerName?.companySuffix || "公司");

  if (rulesPurchaseSection1EnabledEl) rulesPurchaseSection1EnabledEl.checked = p?.section1Items?.enabled !== false;
  if (rulesPurchaseSection1KeywordsEl) {
    const kws = Array.isArray(p?.section1Items?.requiredKeywords) ? p.section1Items.requiredKeywords : ["产品名称", "单价", "数量", "总价", "合计金额"];
    rulesPurchaseSection1KeywordsEl.value = kws.join(",");
  }
  if (rulesPurchaseSection1UpperLowerEl) rulesPurchaseSection1UpperLowerEl.checked = p?.section1Items?.requireUpperLowerAmount !== false;

  if (rulesPurchaseDeliveryAddressEnabledEl) rulesPurchaseDeliveryAddressEnabledEl.checked = p?.deliveryAddress?.enabled !== false;
  if (rulesPurchaseDeliveryKeywordsEl) {
    const kws = Array.isArray(p?.deliveryAddress?.requiredKeywords) ? p.deliveryAddress.requiredKeywords : ["交货地址", "联系人"];
    rulesPurchaseDeliveryKeywordsEl.value = kws.join(",");
  }

  if (rulesPurchaseDeliveryDateEnabledEl) rulesPurchaseDeliveryDateEnabledEl.checked = p?.deliveryDate?.enabled !== false;
  if (rulesPurchaseDeliveryMinPrecisionEl) rulesPurchaseDeliveryMinPrecisionEl.value = String(p?.deliveryDate?.minPrecision || "month");

  if (rulesPurchaseEndUserEnabledEl) rulesPurchaseEndUserEnabledEl.checked = p?.endUserName?.enabled !== false;
  if (rulesPurchaseEndUserSuffixEl) rulesPurchaseEndUserSuffixEl.value = String(p?.endUserName?.companySuffix || "公司");

  if (rulesPurchaseSection4EnabledEl) rulesPurchaseSection4EnabledEl.checked = p?.section4Payment?.enabled !== false;
  if (rulesPurchaseSection4CurrencyEl) rulesPurchaseSection4CurrencyEl.checked = p?.section4Payment?.requireCurrency !== false;
  if (rulesPurchaseSection4UpperLowerEl) rulesPurchaseSection4UpperLowerEl.checked = p?.section4Payment?.requireUpperLowerAmount !== false;

  if (rulesPurchaseTermMaxEnabledEl) rulesPurchaseTermMaxEnabledEl.checked = p?.termMax?.enabled !== false;
  if (rulesPurchaseTermMaxEl) rulesPurchaseTermMaxEl.value = String(clampInt(p?.termMax?.max, 1, 9999, 10));

  if (rulesPurchaseSection8EnabledEl) rulesPurchaseSection8EnabledEl.checked = p?.section8Term?.enabled !== false;
  if (rulesPurchaseCopiesEnabledEl) rulesPurchaseCopiesEnabledEl.checked = p?.copiesCount?.enabled !== false;
}

function rulesFromForm(typeId) {
  const id = String(typeId || "").trim();
  const obj = {
    schemaVersion: "1",
    heading: {
      enabled: rulesHeadingEnabledEl ? Boolean(rulesHeadingEnabledEl.checked) : true,
      maxLevel: clampInt(rulesHeadingMaxLevelEl ? rulesHeadingMaxLevelEl.value : 2, 1, 6, 2)
    },
    placeholder: {
      enabled: rulesPlaceholderEnabledEl ? Boolean(rulesPlaceholderEnabledEl.checked) : true
    },
    deletedClause: {
      enabled: rulesDeletedEnabledEl ? Boolean(rulesDeletedEnabledEl.checked) : true
    }
  };

  const re = rulesPlaceholderRegexEl ? String(rulesPlaceholderRegexEl.value || "").trim() : "";
  if (re) obj.placeholder.regex = re;

  if (id === "purchase") {
    const section1Keywords = (() => {
      const list = splitKeywords(rulesPurchaseSection1KeywordsEl ? rulesPurchaseSection1KeywordsEl.value : "");
      return list.length ? list : ["产品名称", "单价", "数量", "总价", "合计金额"];
    })();
    const deliveryKeywords = (() => {
      const list = splitKeywords(rulesPurchaseDeliveryKeywordsEl ? rulesPurchaseDeliveryKeywordsEl.value : "");
      return list.length ? list : ["交货地址", "联系人"];
    })();
    obj.purchaseContract = {
      enabled: rulesPurchaseEnabledEl ? Boolean(rulesPurchaseEnabledEl.checked) : true,
      signingDate: {
        enabled: rulesPurchaseSigningEnabledEl ? Boolean(rulesPurchaseSigningEnabledEl.checked) : true,
        minPrecision: String((rulesPurchaseSigningMinPrecisionEl && rulesPurchaseSigningMinPrecisionEl.value) || "month") === "day" ? "day" : "month"
      },
      buyerName: {
        enabled: rulesPurchaseBuyerEnabledEl ? Boolean(rulesPurchaseBuyerEnabledEl.checked) : true,
        companySuffix: String((rulesPurchaseBuyerSuffixEl && rulesPurchaseBuyerSuffixEl.value) || "公司").trim() || "公司"
      },
      section1Items: {
        enabled: rulesPurchaseSection1EnabledEl ? Boolean(rulesPurchaseSection1EnabledEl.checked) : true,
        requiredKeywords: section1Keywords,
        requireUpperLowerAmount: rulesPurchaseSection1UpperLowerEl ? Boolean(rulesPurchaseSection1UpperLowerEl.checked) : true
      },
      deliveryAddress: {
        enabled: rulesPurchaseDeliveryAddressEnabledEl ? Boolean(rulesPurchaseDeliveryAddressEnabledEl.checked) : true,
        requiredKeywords: deliveryKeywords
      },
      deliveryDate: {
        enabled: rulesPurchaseDeliveryDateEnabledEl ? Boolean(rulesPurchaseDeliveryDateEnabledEl.checked) : true,
        minPrecision: String((rulesPurchaseDeliveryMinPrecisionEl && rulesPurchaseDeliveryMinPrecisionEl.value) || "month") === "day" ? "day" : "month"
      },
      endUserName: {
        enabled: rulesPurchaseEndUserEnabledEl ? Boolean(rulesPurchaseEndUserEnabledEl.checked) : true,
        companySuffix: String((rulesPurchaseEndUserSuffixEl && rulesPurchaseEndUserSuffixEl.value) || "公司").trim() || "公司"
      },
      section4Payment: {
        enabled: rulesPurchaseSection4EnabledEl ? Boolean(rulesPurchaseSection4EnabledEl.checked) : true,
        requireCurrency: rulesPurchaseSection4CurrencyEl ? Boolean(rulesPurchaseSection4CurrencyEl.checked) : true,
        requireUpperLowerAmount: rulesPurchaseSection4UpperLowerEl ? Boolean(rulesPurchaseSection4UpperLowerEl.checked) : true
      },
      termMax: {
        enabled: rulesPurchaseTermMaxEnabledEl ? Boolean(rulesPurchaseTermMaxEnabledEl.checked) : true,
        max: clampInt(rulesPurchaseTermMaxEl ? rulesPurchaseTermMaxEl.value : 10, 1, 9999, 10)
      },
      section8Term: {
        enabled: rulesPurchaseSection8EnabledEl ? Boolean(rulesPurchaseSection8EnabledEl.checked) : true
      },
      copiesCount: {
        enabled: rulesPurchaseCopiesEnabledEl ? Boolean(rulesPurchaseCopiesEnabledEl.checked) : true
      }
    };
  }
  return obj;
}

async function loadRulesFor(typeId) {
  if (!rulesFormEl) return;
  const id = String(typeId || "").trim();
  if (!id) {
    fillRulesForm("", defaultRulesObject(""));
    return;
  }
  setRulesStatus("加载中…");
  try {
    const res = await fetch(`/api/standard-contracts/${encodeURIComponent(id)}/rules`);
    if (res.status === 404) {
      fillRulesForm(id, defaultRulesObject(id));
      setRulesStatus("未配置，已填入默认值");
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    fillRulesForm(id, data?.rules ?? data ?? {});
    setRulesStatus("已加载");
  } catch (e) {
    fillRulesForm(id, defaultRulesObject(id));
    setRulesStatus(`加载失败：${e?.message || String(e)}`);
  }
}

async function saveRulesFor(typeId) {
  if (!rulesFormEl) return;
  const id = String(typeId || "").trim();
  if (!id) return;
  const obj = rulesFromForm(id);
  setRulesStatus("保存中…");
  try {
    const res = await fetch(`/api/standard-contracts/${encodeURIComponent(id)}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: obj })
    });
    if (!res.ok) throw new Error(await res.text());
    setRulesStatus("已保存");
    await loadStandardTypes();
  } catch (e) {
    setRulesStatus(`保存失败：${e?.message || String(e)}`);
  }
}

if (rulesBtn) rulesBtn.addEventListener("click", async () => {
  await loadStandardTypes();
  openRulesModal();
  const id = String((rulesStandardTypeEl && rulesStandardTypeEl.value) || "");
  await loadRulesFor(id);
  await loadRulesTemplatePreviewFor(id);
});
if (rulesModalCloseEl) rulesModalCloseEl.addEventListener("click", closeRulesModal);
if (rulesModalBackdropEl) rulesModalBackdropEl.addEventListener("click", closeRulesModal);
if (rulesLoadBtn) rulesLoadBtn.addEventListener("click", async () => loadRulesFor(rulesStandardTypeEl ? rulesStandardTypeEl.value : ""));
if (rulesSaveBtn) rulesSaveBtn.addEventListener("click", async () => saveRulesFor(rulesStandardTypeEl ? rulesStandardTypeEl.value : ""));
if (rulesTemplateFileEl) rulesTemplateFileEl.addEventListener("change", () => updateRulesTemplateLabel());
if (rulesTemplateUploadBtn) rulesTemplateUploadBtn.addEventListener("click", async () => uploadTemplateFor(rulesStandardTypeEl ? rulesStandardTypeEl.value : ""));
if (rulesStandardTypeEl) rulesStandardTypeEl.addEventListener("change", async () => {
  updateRulesTemplateLabel();
  await loadRulesFor(rulesStandardTypeEl.value);
  await loadRulesTemplatePreviewFor(rulesStandardTypeEl.value);
});

if (rulesTemplatePreviewEl) {
  rulesTemplatePreviewEl.addEventListener("click", async (e) => {
    const btn = e?.target?.closest ? e.target.closest("[data-copy-block]") : null;
    const id = btn ? String(btn.getAttribute("data-copy-block") || "") : "";
    if (!id) return;
    const ok = await copyTextToClipboard(id);
    setRulesAnchorBar(ok ? `已复制模板块锚点：${id}` : `复制失败：${id}`);
    setTimeout(() => setRulesAnchorBar(""), 1800);
  });
}

loadStandardTypes();

exportBtn.addEventListener("click", async () => {
  if (!currentCompareId) return;
  exportBtn.disabled = true;
  pdfLink.style.display = "none";
  setProgress(true);
  setStatus("PDF 导出中…");
  try {
    const res = await fetch(`/api/compare/${encodeURIComponent(currentCompareId)}/export/pdf`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ diffOnly: Boolean(diffOnlyEl?.checked) })
    });
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

function statusToLevel(status) {
  if (status === "fail") return "high";
  if (status === "warn" || status === "manual") return "medium";
  return "low";
}

function renderConfirmResult(result) {
  if (!confirmListEl || !confirmMetaEl) return;
  setConfirmAreaExpanded(false);
  confirmListEl.innerHTML = "";
  const overall = result?.overall || {};
  const items = Array.isArray(result?.items) ? result.items : [];
  const pass = Number(overall.pass || 0);
  const fail = Number(overall.fail || 0);
  const warn = Number(overall.warn || 0);
  const manual = Number(overall.manual || 0);
  confirmMetaEl.textContent = `${items.length} 项 · 失败 ${fail} · 警告 ${warn} · 待复核 ${manual}`;
  if (confirmTipEl) {
    confirmTipEl.style.display = "block";
    confirmTipEl.textContent = String(overall.summary || "");
  }

  for (const it of items) {
    const card = document.createElement("div");
    card.className = "risk-item";
    card.dataset.level = statusToLevel(it.status);

    const head = document.createElement("div");
    head.className = "risk-head";

    const title = document.createElement("div");
    title.className = "risk-title";
    const lvl = statusToLevel(it.status);
    title.innerHTML = `${levelIcon(lvl)}<span class="t">${String((it.status || "").toUpperCase())} · ${String(it.title || it.pointId || "")}</span>`;

    const actions = document.createElement("div");
    actions.className = "risk-actions";

    const locateBtn = document.createElement("button");
    locateBtn.type = "button";
    locateBtn.className = "mini-btn";
    locateBtn.textContent = "定位";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "mini-btn";
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.textContent = "展开";

    actions.appendChild(locateBtn);
    actions.appendChild(toggleBtn);
    head.appendChild(title);
    head.appendChild(actions);

    const summary = document.createElement("div");
    summary.className = "risk-summary";
    summary.textContent = String(it.reason || "");

    const tags = document.createElement("div");
    tags.className = "meta";
    tags.textContent = Array.isArray(it.tags) ? it.tags.join(", ") : "";

    const body = document.createElement("div");
    body.className = "risk-body";
    body.hidden = true;

    const e = it.evidence || {};
    const tpl = String(e.templateText || "");
    const ctr = String(e.contractText || "");
    if (tpl) {
      const k = document.createElement("div");
      k.className = "k";
      k.textContent = "模板证据";
      const v = document.createElement("div");
      v.textContent = tpl;
      body.appendChild(k);
      body.appendChild(v);
    }
    if (ctr) {
      const k = document.createElement("div");
      k.className = "k";
      k.textContent = "合同证据";
      const v = document.createElement("div");
      v.textContent = ctr;
      body.appendChild(k);
      body.appendChild(v);
    }

    if (it.ai && it.ai.status === "done" && it.ai.result) {
      const r = it.ai.result || {};
      const sumK = document.createElement("div");
      sumK.className = "k";
      sumK.textContent = "AI 解读";
      const sumV = document.createElement("div");
      sumV.textContent = String(r.summary || "");
      body.appendChild(sumK);
      body.appendChild(sumV);
    }
    if (it.ai && it.ai.status === "failed") {
      const k = document.createElement("div");
      k.className = "k";
      k.textContent = "AI 失败";
      const v = document.createElement("div");
      v.textContent = String(it.ai.error || "");
      body.appendChild(k);
      body.appendChild(v);
    }

    toggleBtn.addEventListener("click", () => {
      const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
      toggleBtn.setAttribute("aria-expanded", expanded ? "false" : "true");
      toggleBtn.textContent = expanded ? "展开" : "收起";
      body.hidden = expanded;
      if (!expanded) card.classList.add("expanded");
      else card.classList.remove("expanded");
    });

    locateBtn.addEventListener("click", () => {
      const rowId = String(e.rowId || "").trim();
      if (!rowId) return;
      const rowEl = resultEl.querySelector(`.diff-row[data-row-id="${CSS.escape(rowId)}"]`);
      if (!rowEl) return;
      const target = rowEl.querySelector(".diff-cell");
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "center" });
      clearActiveDiff();
      const cells = rowEl.querySelectorAll(".diff-cell");
      for (const c of cells) c.classList.add("active-diff-cell");
    });

    card.appendChild(head);
    card.appendChild(summary);
    if (tags.textContent) card.appendChild(tags);
    card.appendChild(body);
    confirmListEl.appendChild(card);
  }
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  isSubmitting = true;
  submitBtn.disabled = true;
  resultEl.innerHTML = "";
  risksEl.innerHTML = "";
  if (confirmListEl) confirmListEl.innerHTML = "";
  compareMetaEl.textContent = "";
  riskMetaEl.textContent = "";
  if (confirmMetaEl) confirmMetaEl.textContent = "";
  exportBtn.disabled = true;
  pdfLink.style.display = "none";
  currentCompareId = null;
  setProgress(true);
  setStatus("上传中…");

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
    const standardTypeId = getDocTypeId();
    const hasLeft = Boolean(leftFileEl?.files?.[0]);
    const hasType = Boolean(standardTypeId);
    const needsConfirm = hasType;
    const url = hasType && !hasLeft ? "/api/standard/confirm" : "/api/compare";

    if (hasType) fd.set("standardTypeId", standardTypeId);
    setStatus(needsConfirm ? "上传并校验中…" : "上传并对比中…");
    const res = await fetch(url, { method: "POST", body: fd });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    resultEl.innerHTML = data?.diff?.diffHtml || "";
    refreshDiffNav();
    updateSectionTip(data?.diff?.meta);
    const compareId = data?.compareId;
    currentCompareId = compareId;
    compareMetaEl.textContent = compareId ? `ID ${compareId.slice(-8)}` : "";
    exportBtn.disabled = !compareId;

    if (needsConfirm) {
      if (confirmCardEl) confirmCardEl.style.display = "block";
      if (riskCardEl) riskCardEl.style.display = "none";

      const confirm = data?.confirm || {};
      if (confirm?.mode === "async" && confirm?.status === "pending") {
        setStatus("确认点校验中…");
        const finalData = await pollConfirm(compareId);
        if (finalData?.confirm?.status === "done") {
          renderConfirmResult(finalData?.confirm?.result);
          setStatus("完成");
        } else {
          const reason = String(finalData?.confirm?.error || finalData?.confirm?.status || "failed");
          if (confirmTipEl) {
            confirmTipEl.style.display = "block";
            confirmTipEl.textContent = `确认失败：${reason}`;
          }
          if (confirmMetaEl) confirmMetaEl.textContent = "失败";
          setStatus(`确认失败：${reason}`);
        }
      } else {
        renderConfirmResult(confirm?.result);
        setStatus("完成");
      }
    } else {
      if (confirmCardEl) confirmCardEl.style.display = "none";
      if (riskCardEl) riskCardEl.style.display = "block";
      if (data?.ai?.mode === "async" && data?.ai?.status === "pending") {
        setStatus("AI 分析中…");
        const finalData = await pollAi(compareId);
        if (finalData?.ai?.status === "done") {
          renderAiResult(finalData?.ai?.result);
          setStatus("完成");
        } else {
          const reason = String(finalData?.ai?.error || finalData?.ai?.status || "failed");
          renderAiResult(null);
          riskMetaEl.textContent = "失败";
          sectionTipEl.style.display = "block";
          sectionTipEl.textContent = `AI 失败：${reason}`;
          setStatus(`AI 失败：${reason}`);
        }
      } else {
        renderAiResult(data?.ai?.result);
        setStatus("完成");
      }
    }
  } catch (err) {
    setStatus(`失败：${err?.message || String(err)}`);
  } finally {
    setProgress(false);
    isSubmitting = false;
    applyModeUi();
  }
});

setStatus("");
