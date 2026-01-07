# 项目概要：AI 驱动的合同差异分析与风险评估工具

## 1. 项目目的

本项目旨在开发一个智能合同分析工具，帮助法务、商务及管理人员快速识别和评估两个不同版本合同文件之间的差异，并由 AI 提供专业的风险分析和建议。该工具的核心特点是能够在比对过程中保留原始文档的版式和样式，提供直观、易于理解的比对结果，从而大幅提升合同审查的效率和准确性，降低潜在的商业和法律风险。

## 2. 核心功能

*   **双文件上传**：提供一个简洁的用户界面，支持用户同时上传两个版本的合同文件。
*   **样式保持比对**：在后端将文档转换为保留样式的 HTML 格式，并在此基础上进行差异比对。最终在前端生成一个保留了原文档大部分样式（如标题、列表、表格、加粗等）的差异视图。
*   **可视化差异高亮**：在比对视图中，使用直观的颜色和标记（例如，绿色背景表示新增，红色删除线表示删除）来高亮显示文本和格式的变更。
*   **AI 风险洞察**：自动将存在差异的条款发送给大型语言模型（LLM），由 AI 模拟法务专家的视角，对变更内容进行风险分析，并提供具体的应对建议。
*   **一体化视图**：将可视化差异比对结果与 AI 生成的风险建议并排或集成展示，方便用户一站式完成审查工作。

## 3. 技术架构与选型

### 3.1. 总体流程

项目的核心处理流程如下：
**`用户上传 .docx` -> `后端转换为 HTML` -> `后端比对生成 Diff HTML` -> `后端调用 AI 分析` -> `前端渲染最终 HTML 和 AI 建议`**

### 3.2. 前端 (Frontend)

*   **框架**: 建议使用 **React** 或 **Vue**，基于项目现有技术栈决定。
*   **核心任务**:
    *   构建文件上传组件。
    *   使用 `axios` 或 `fetch` 将文件发送到后端。
    *   接收后端返回的完整 HTML 比对结果，并直接将其渲染到页面中（使用 `dangerouslySetInnerHTML` 或等效方法）。
    *   编写简单的 CSS 规则来定义差异标签（`<ins>`, `<del>`）的显示样式（如颜色、背景、删除线等）。
    *   展示由后端返回的 AI 风险分析结果。

### 3.3. 后端 (Backend)

*   **框架**: 建议使用 **Node.js + Express** 或 **Python + FastAPI**，以提供高效的 I/O 和 API 服务。
*   **技术选型**:
    *   **文档到 HTML 转换**:
        *   **(初期 .docx 处理)**: 使用 `mammoth.js` (Node.js) 或 `pypandoc` (Python) 库，这两个库都能很好地将 `.docx` 文件转换为干净的 HTML。
    *   **HTML 差异比对**:
        *   使用 `htmldiff.js` 或类似的库，它能够比较两个 HTML 字符串并生成一个包含 `<ins>` 和 `<del>` 标签的合并后 HTML。
    *   **API 设计**:
        *   设计一个主 API 端点 `/api/compare`，接收 `multipart/form-data` 格式的两个文件。
        *   返回一个 JSON 对象，其中包含 `diffHtml` (比对结果的 HTML 字符串) 和 `aiSuggestions` (AI 分析结果)。

### 3.4. AI 集成 (AI Integration)

*   **模型**: 调用一个强大的大型语言模型（如 Google Gemini, OpenAI GPT 等）。
*   **Prompt 工程**: 设计一个结构化的 Prompt，将带有差异标签的 HTML 片段传递给模型，并明确指示其扮演法务专家的角色，分析风险并给出建议。

## 4. 初期开发范围 (MVP)

*   **专注 `.docx` 文件**: 第一阶段的开发将完全集中在对 `.docx` 文件的处理上。
*   **完成核心流程**: 实现从文件上传、后端处理（HTML 转换、比对、AI 分析）到前端展示的完整工作流。
*   **基本 UI**: 搭建功能性的前端页面，确保用户可以顺利完成一次比对和分析任务。

## 5. 扩展性设计

为了确保项目未来的可扩展性，后端架构将采用模块化设计。

*   **文档处理服务化**: 创建一个“文档解析器 (Document Parser)”模块。该模块将根据文件类型（通过文件扩展名或 MIME 类型判断）调用不同的解析策略。
*   **初期策略**: 内置一个 `DocxParser`，负责调用 `mammoth.js` 等库处理 `.docx` 文件。
*   **未来扩展 (.pdf)**: 当需要支持 PDF 时，我们只需在该模块中新增一个 `PdfParser`。这个新的解析器将负责调用您提到的 `mineruapi`。核心的比对、AI 分析和前端逻辑**无需任何更改**，只需将 `PdfParser` 的输出（HTML）接入后续流程即可。这种设计将极大降低未来新格式支持的开发成本。

---
*该文档由 AI 助手生成，旨在作为项目启动的初步规划。*

## 6. 详细规划（最佳实践版）

本章节在保留“样式尽量还原”的前提下，以“块级对齐 + 结构化差异 + 异步 AI + 可生成展示用 PDF”的工程化路线给出可落地的端到端设计。核心思想是：不要在原始 DOCX/PDF 上做“插空行对齐”，而是在中间层构造一个稳定的“对比文档工件（Compare Artifact）”，用于在线展示与导出 PDF。

### 6.1. 总体目标与非目标

**目标**

*   左右分栏展示时实现“条款块对齐”，新增/删除段落不再造成整体视觉错位。
*   Diff 高亮与 AI 建议强绑定到具体差异块，可定位、可跳转、可追溯。
*   支持生成“展示用对比 PDF”，在视觉上稳定（分页可控、两列对齐、样式统一）。
*   后端服务统一由 `docker-compose` 管理，便于部署与扩展。

**非目标（MVP 阶段明确不做）**

*   追求与 Word 的逐像素一致排版（page-perfect）渲染。
*   在原始 PDF 上直接插入空白段实现对齐（不可行且维护成本高）。

### 6.2. 核心流程（推荐落地形态）

**主流程（DOCX/PDF 通用）**

**`上传` -> `解析为规范化 HTML + 块模型` -> `块级对齐（行对行）` -> `行内差异（ins/del）` -> `生成对比 HTML 工件` -> `异步 AI 风险分析（按块）` -> `前端渲染/导出对比 PDF`**

输出工件分为两类：

*   **语义对比工件**：`compare.html`（两列行对齐 + ins/del 高亮 + blockId 锚点）与 `compare.json`（blocks、alignment、统计、AI 结果）
*   **展示用工件（可选）**：`compare.pdf`（由对比 HTML 渲染导出，保证两列对齐）

### 6.3. 中间表示：块模型（Block Model）

把文档拆成可比对的“块（block）”，每块作为对齐与 AI 的最小单元。推荐块类型：

*   `heading`：标题（含 level）
*   `paragraph`：普通段落
*   `list_item`：列表项（可带 listId、level、marker）
*   `table_cell`：表格单元格内容（以 cell 为主，而非整个表）

块结构建议（JSON Schema 方向）：

```json
{
  "blockId": "b_001",
  "kind": "paragraph",
  "structurePath": "body.p[12]",
  "stableKey": "sk_...",
  "text": "乙方应在收到发票后30日内付款。",
  "htmlFragment": "<p>乙方应在收到发票后30日内付款。</p>",
  "meta": {
    "pageHint": null,
    "styleHint": "Normal",
    "table": null
  }
}
```

`stableKey` 生成建议：对 `text` 做规范化（去多余空白、统一全半角/换行），再与 `structurePath` 拼接做哈希，用于解析器升级或 reflow 时的容错匹配。

### 6.4. 解析与规范化（Parser + Normalizer）

#### 6.4.1. Parser 接口

Document Parser 对外输出统一结构：

*   `normalizedHtml`：尽量语义化、稳定的 HTML
*   `blocks[]`：按段落/标题/单元格拆分的块列表
*   `resources[]`（可选）：图片等外部资源引用

#### 6.4.2. Normalizer 的必要性

HTML 直接 diff 常会被转换器产生的结构噪声干扰（大量 `span`、碎片化文本节点等）。因此在进入对齐与 diff 前，必须做规范化：

*   合并相邻文本节点、统一空白与换行策略
*   去除无意义的空 `span`、重复样式包装
*   表格/列表输出格式统一（尤其是列表编号、缩进层级）
*   将块边界稳定化（例如每个块都落在一个 `<section data-block-id>` 容器里）

### 6.5. 对齐算法：块级对齐（解决左右分栏不齐）

对齐的产物是 `alignmentRows[]`，每一行对应左右各一个块（或空占位）：

```json
[
  { "rowId": "r_001", "leftBlockId": "b_001", "rightBlockId": "b_004", "kind": "matched" },
  { "rowId": "r_002", "leftBlockId": "b_002", "rightBlockId": null,    "kind": "deleted" },
  { "rowId": "r_003", "leftBlockId": null,    "rightBlockId": "b_005", "kind": "inserted" }
]
```

实现建议：

*   以 `blocks[].text` 为主做序列匹配（可用 LCS/Patience diff 思路），对相似度高的段落认为是 `matched`，否则是 `inserted/deleted`
*   对 `heading` 与 `table_cell` 可引入更强的结构约束（例如标题优先对齐，表格以行列位置辅助对齐）
*   输出 `rowId` 用于前端渲染与定位，避免依赖数组索引

### 6.6. 行内差异：在 matched 行内生成 ins/del

只对 `kind=matched` 的行做行内 diff（单词级/字符级），并输出：

*   `diffHtmlFragment`：包含 `<ins>` 与 `<del>` 的片段
*   `tokens[]`：用于统计与更精确锚点（可选）

在 `inserted/deleted` 行，整块直接标记新增/删除即可，不必做行内 diff。

### 6.7. 对比 HTML 工件：两列行对齐渲染（可导出 PDF）

推荐使用“按行的两列布局”，每行固定包含左右两格：

*   每行容器：`<div class="diff-row" data-row-id="r_001">`
*   左格：`<section class="diff-cell left" data-block-id="b_001">...</section>`
*   右格：`<section class="diff-cell right" data-block-id="b_004">...</section>`
*   空占位：渲染空的 `<section class="diff-cell empty">`，实现视觉对齐

导出 PDF 时，确保“行不被分页拆开”的 CSS 策略（例如避免将同一行拆到两页），并统一字体与行距以降低 reflow 差异。

### 6.8. API 设计（推荐最小集合）

#### 6.8.1. POST /api/compare

**请求**

*   `multipart/form-data`
*   字段：`leftFile`、`rightFile`
*   可选字段：`aiMode`（`none|async`）、`output`（`html|html+pdf`）

**响应（核心字段）**

```json
{
  "compareId": "cmp_...",
  "status": "done",
  "diff": {
    "diffHtml": "<article>...</article>",
    "anchorStrategy": {
      "kind": "data-attr",
      "rowAttr": "data-row-id",
      "blockAttr": "data-block-id",
      "insAttr": "data-ins-id",
      "delAttr": "data-del-id"
    },
    "summary": { "rows": 128, "matched": 96, "inserted": 18, "deleted": 14 },
    "rows": [
      {
        "rowId": "r_001",
        "kind": "matched",
        "leftBlockId": "b_001",
        "rightBlockId": "b_004",
        "diff": {
          "diffHtmlFragment": "<p>...<del data-del-id=\"d_1\">30</del><ins data-ins-id=\"i_1\">60</ins>...</p>"
        },
        "ai": { "status": "pending", "jobId": "job_ai_..." }
      }
    ]
  },
  "artifacts": {
    "compareHtmlUrl": "/api/compare/cmp_.../artifact/html",
    "comparePdfUrl": null
  },
  "ai": {
    "mode": "async",
    "jobId": "job_ai_...",
    "status": "pending",
    "pollUrl": "/api/ai/jobs/job_ai_..."
  },
  "errors": []
}
```

`rows[]` 可根据体积控制：MVP 可只返回 `diffHtml` + `summary` + `ai.jobId`，`rows` 由 `/api/compare/{compareId}` 另取。

#### 6.8.2. GET /api/compare/{compareId}

返回 `rows`、`blocks`、统计、AI 聚合结果（若已完成）。

#### 6.8.3. GET /api/compare/{compareId}/artifact/html

返回完整可直接渲染的对比 HTML（包含必要 CSS），供前端 `iframe` 或直接注入渲染，也可用于导出 PDF。

#### 6.8.4. POST /api/compare/{compareId}/export/pdf

触发导出任务，返回 `exportJobId`，完成后在 `artifacts.comparePdfUrl` 提供下载地址。

#### 6.8.5. AI 任务：GET /api/ai/jobs/{jobId}

状态机：`pending -> running -> done | failed | cancelled`

### 6.9. AI 风险输出：最小可用 Schema（v1）

每条风险必须绑定 `blockId`（或 `rowId`），并给出可复核引用（before/after 文本）。

```json
{
  "schemaVersion": "1",
  "blockId": "b_001",
  "clauseType": "payment_terms",
  "level": "high",
  "tags": ["payment", "cashflow"],
  "confidence": 0.78,
  "summary": "付款周期由30天延长至60天，回款风险上升。",
  "analysis": "延长账期可能导致现金流压力增大，并降低违约约束强度。",
  "recommendations": [
    "增加逾期利息/违约金条款或提高违约金比例",
    "引入预付款或分阶段付款",
    "明确验收与开票节点，避免付款条件不清"
  ],
  "questionsForReview": [
    "是否存在担保或保证金安排？",
    "历史交易信用是否支持延长账期？"
  ],
  "citations": {
    "beforeText": "乙方应在收到发票后30日内付款。",
    "afterText": "乙方应在收到发票后60日内付款。",
    "anchors": {
      "blockSelector": "[data-block-id=\"b_001\"]",
      "insIds": ["i_1"],
      "delIds": ["d_1"]
    }
  }
}
```

### 6.10. 安全与合规（必须纳入 MVP）

*   上传文件与对比 HTML 工件视为不可信输入，渲染前必须做 HTML 消毒与标签白名单策略。
*   文件存储应使用随机对象名与权限隔离，下载链接使用短期签名或鉴权。
*   AI 输入默认只发送必要的差异块与上下文，不发送整份合同全文（可配置）。
*   全链路审计：记录 `compareId`、文件 hash、解析器版本、diff 版本、prompt 版本、模型版本、生成时间。

### 6.11. docker-compose 服务拆分（建议）

在 `docker-compose` 统一编排：

*   **api**：HTTP API（上传、查询、鉴权、工件下载）
*   **worker**：异步任务执行（解析、对齐、导出 PDF、AI 分析）
*   **queue**：任务队列与状态存储（例如 Redis）
*   **db**：业务数据（对比记录、块模型、AI 结果、审计）
*   **object-storage**：文件与工件存储（例如 S3 兼容）
*   **converter**（可选）：用于 HTML->PDF 的渲染服务或 headless 浏览器运行环境

### 6.12. 里程碑（建议 3 个阶段）

**阶段 1：DOCX MVP（可用性优先）**

*   上传两份 DOCX -> 输出对比 HTML（两列对齐）-> 返回 `compareId`
*   异步 AI：按变更块生成风险项并绑定 `blockId`

**阶段 2：对比 PDF 工件（交付形态增强）**

*   对比 HTML 渲染导出 PDF
*   统一样式主题、分页策略、行不拆页策略

**阶段 3：PDF 输入支持与统一中间表示**

*   PdfParser 接入，输出与 DocxParser 同构的 `blocks` 与 `normalizedHtml`
*   差异、对齐、AI、导出流程复用，不新增主流程复杂度
