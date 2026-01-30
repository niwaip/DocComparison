# 合同标准确认与审核系统设计方案（贴合当前 doc-com 项目）

## 1. 当前项目现状（必须遵守的约束）

本仓库现有能力不是“从零搭一个审核平台”，而是已经具备一条完整的“对比与异步分析”流水线，应当以最小增量扩展：

*   **后端形态:** Node.js + TypeScript + Express。
    *   合同比对入口：`POST /api/compare`（产出 compareId、diffHtml、compare.json/html）。
    *   异步任务：BullMQ + Redis（`analyze` 与 `exportPdf` 两类 job）。
*   **核心中间表示:** safe HTML → Block[] → AlignmentRow[] → diff HTML（<ins>/<del>）。
    *   `Block` 具备 `blockId/stableKey/structurePath/text/htmlFragment`。
    *   `AlignmentRow` 具备 `rowId/kind/leftBlockId/rightBlockId/meta/diff`，可作为证据锚点。
*   **工件与存储:** 每个 compareId 一个 artifacts 目录，保存：
    *   `compare.json`（全量结构化结果）
    *   `compare.html`（渲染页）
    *   `compare.pdf`（导出产物）
*   **运行方式:** 后台服务统一由 docker-compose 管理（Redis/API/Worker）。
*   **LLM 集成:** 已支持 OpenAI 兼容与 SiliconFlow 配置（通过环境变量，异步分析写回 compare.json）。

结论：标准合同“内容确认/审核”最合理的落点，是在现有 compare.json 工件上新增一段 confirm 结果，并增加一个与 `analyze/exportPdf` 同风格的异步 job。

---

## 2. 目标定义（在现有对比能力上做增量）

**标准合同内容确认 = 模板合同（左） vs 实际合同（右）的对比 + 对确认点逐项校验**

需要新增的业务能力：

1.  **模板化与版本化:** 多份标准合同模板，必须版本化，历史任务可复现。
2.  **确认点（规则）驱动:** 每份模板版本绑定一组“必须检查”的确认点清单（你们现有 Excel 可作为规则来源）。
3.  **规则优先、AI 补充:** 规则负责确定性结论；AI 负责语义判断、解释与建议，且必须可追溯到证据文本。
4.  **可溯源输出:** 每个确认点的结论必须能定位到 `blockId/rowId`，支持前端一键跳转到对比视图证据。

---

## 3. 数据模型建议（直接贴合 compare.json 思路）

### 3.1. 模板（Template）与快照

模板建议至少具备：

*   `templateId`：稳定标识（如 `std_sales_purchase`）
*   `name`：展示名称
*   `version`：版本号（建议使用日期或语义版本）
*   `source`：源文件信息（文件名、hash、mimeType）
*   `blocksSnapshot`：模板解析后的 Block 快照（避免模板变更导致历史任务不可复现）

说明：模板的“内部表示”不要转 Markdown；项目内部已稳定使用 Block/Row 作为结构化中间表示，这也是定位证据的基础。

### 3.2. 确认点（Confirmation Point）

每个确认点建议具备：

*   `pointId`：稳定标识（如 `payment.term_days`）
*   `title/description`：审核人可读文本
*   `severity`：high/medium/low
*   `required`：是否必须（通常 true）
*   `tags`：付款/责任/终止/争议解决/数据合规等
*   `anchor`：定位证据的策略（见 4）
*   `extractor`：字段提取策略（见 5）
*   `rules[]`：规则列表（见 5）
*   `aiPolicy`：never / when_unknown / always（或更细）

### 3.3. compare.json 扩展（概念结构）

在现有 compare.json 中新增 `standard` 与 `confirm` 两段（沿用现有 ai/export 的状态机风格）：

*   `standard`: `{ templateId, version, snapshotHash, pointsSnapshotHash }`
*   `confirm`:
    *   `mode`: `none | async`
    *   `status`: `none | pending | running | done | failed | cancelled`
    *   `jobId`
    *   `result`: `{ overall, items[] }`
    *   `error`

其中 `items[]`（逐确认点结果）至少包含：

*   `pointId/title/severity/required/tags`
*   `status`: pass | fail | warn | manual | not_applicable
*   `reason`: 规则引擎可解释的原因
*   `evidence`: `{ relatedBlockIds, relatedRowIds, citations, extractedValues }`
*   `ai`: `{ status, summary, suggestions, questionsForReview, confidence }`（可选）

---

## 4. 证据定位（Anchor）策略（不引入向量库也能做强）

你们现有“块级对齐 + 稳定键”是天然的检索系统。建议 anchor 支持多策略并可回退：

1.  **byStableKey（优先）**
    *   适用于：模板版本固定且 blocksSnapshot 可用
    *   思路：确认点绑定模板侧 `stableKey` 或 `blockId`，在实际合同侧通过 `AlignmentRow` 找到对应块
2.  **byStructurePath**
    *   适用于：合同结构稳定、标题层级明确
3.  **bySectionLabel + 相似度窗口**
    *   适用于：章节号存在但会变动（项目已内置忽略章节号噪声的对齐逻辑）
4.  **byKeywordWindow**
    *   适用于：字段点（如“付款方式”“违约金”“争议解决”）在模板中较稳定出现
5.  **byChangedRowsOnly**
    *   适用于：只关心“被修改/新增/删除”的条款（直接扫 diff.rows 的 modified/inserted/deleted）

输出证据务必落到：

*   `relatedBlockIds`: 模板侧与合同侧 blockId（或仅合同侧）
*   `relatedRowIds`: 若能映射到对齐行
*   `citations`: 原文片段（建议截断/归一化）

---

## 5. 规则引擎（Rule Engine）设计（先解决 80% 确定性问题）

### 5.1. 规则优先原则

*   能规则确定的，不交给 AI。
*   规则输出必须可解释、可复核、可追溯到证据。
*   规则无法判断（unknown/manual）才触发 AI 或提示人工复核。

### 5.2. 推荐内置规则类型（可直接映射到 Excel 配置）

*   `PRESENCE`：必须存在某条款/关键词/标题
*   `NOT_MODIFIED`：条款不得修改（或仅允许白名单差异）
*   `REGEX_MATCH`：格式校验（统一社会信用代码、账号、电话等）
*   `NUMBER_RANGE`：数值范围（付款周期、违约金比例、责任上限等）
*   `DATE_RANGE`：日期范围（交付日期、验收期等）
*   `ENUM_IN_SET`：枚举必须在集合内（币种、交付方式等）
*   `RELATION_CONSTRAINT`：字段间关系（比例和为 100% 等）
*   `CROSS_CLAUSE_CONSISTENCY`：跨条款一致性（主体名称/地址/签署日期一致）

### 5.3. 提取器（Extractor）与校验器（Validator）拆分

将“从证据文本提取字段”和“对字段做校验”拆开，便于维护与解释：

*   提取器：
    *   `REGEX_CAPTURE`
    *   `KEYWORD_AFTER`
    *   `DIFF_INS_TEXT`（模板为空白/占位符 → 实际合同填写时非常有效）
*   校验器：
    *   `NOT_EMPTY / RANGE / MATCH / RELATION` 等

### 5.4. 规则来源与管理（贴合你们现状）

你们已经在仓库中维护了 `RAG_Requirements_legal.xlsx`。建议继续以 Excel 作为“确认点清单”维护载体，系统提供导入/校验/快照固化：

建议列：

*   `templateId/templateVersion`
*   `pointId/title/severity/required/tags`
*   `anchorType/anchorQuery`
*   `extractorType/extractorParams`
*   `ruleType/ruleParams`
*   `aiPolicy`

每次任务运行，把“确认点清单”做成快照写入 compare.json（保证可追溯与可复现）。

---

## 6. AI 引擎（Point-level AI）设计（复用现有 LLM 调用与限流/重试）

你们现有 AI 分析是“按 diff rows 生成 overall/sections 报告”。标准合同确认建议新增一个“按确认点”的 AI 调用模式：

### 6.1. AI 的职责边界

*   **语义判断:** 条款是否等价、是否存在责任转移/不公平条款等
*   **解释与建议:** 把规则失败原因与风险解释成可执行建议
*   **追问清单:** 输出需要人工确认的问题

AI 不应：

*   在规则已明确 fail 的情况下“翻案”为 pass（最多给出“可能可接受但需复核”的建议）
*   编造证据引用（必须基于输入 citations）

### 6.2. 输入输出（严格 JSON）

建议对“确认点 AI”定义专用 schema（同你们现有 analyze 的强 JSON 风格）：

输入包含：

*   point 元数据（title/description/severity/required）
*   模板侧证据文本 + 合同侧证据文本（citations）
*   规则结果（status/reason/extractedValues）

输出包含：

*   `status`（pass/fail/warn/manual）
*   `summary/reasoning/suggestions/questionsForReview/confidence`
*   `citations`（仅引用输入范围内的片段）

### 6.3. 触发策略（默认）

*   规则 `fail`：AI 仅做“风险解释 + 建议修订”
*   规则 `manual/unknown`：AI 做“判断建议 + 追问”
*   高风险点（付款/责任/争议解决/数据合规）：可抽样复核

---

## 7. 与现有服务/任务体系的融合（最小改动路径）

### 7.1. 新增一个异步 job：`confirmStandard`

行为与现有 `analyze/exportPdf` 类似：

1.  worker 读取 compare.json（已包含 diff/blocks/rows）
2.  加载模板快照 + 确认点快照
3.  对每个确认点：定位证据 → 提取字段 → 执行规则 → 按策略调用 AI
4.  写回 compare.json 的 `confirm` 字段（含 status/result/error）

失败处理策略与现有 worker 一致：写入 `confirm.error`，便于前端显示与重试。

### 7.2. API 形态建议（概念）

保持你们现有风格（以 compareId 为中心、工件落盘）：

*   `POST /api/standard/confirm`
    *   输入：templateId/version + contractFile（或已有 compareId）
    *   输出：runId/compareId + confirmJobId + 轮询地址
*   `GET /api/standard/confirm/:runId`
    *   输出：confirm 结果（或直接复用 `GET /api/compare/:compareId`）

---

## 8. 前端展示建议（基于现有对比页增强，不推翻重做）

你们前端已有“上传/对比/AI 状态/差异高亮/跳转”。建议新增一个“确认点视图”：

*   左侧列表：按 severity/status 过滤与排序
*   点进确认点：展示规则结论、证据片段、AI 解读（如有）
*   “定位证据”按钮：滚动/跳转到对比视图对应 `rowId/blockId`

---

## 9. 迭代落地路线（按最小可用到可运营）

1.  **MVP（1-2 个模板跑通）**
    *   模板快照（blocksSnapshot）+ Excel 确认点导入（pointsSnapshot）
    *   规则引擎跑通并写入 compare.json.confirm
    *   前端增加确认点列表 + 跳转到证据
2.  **V1（可规模化维护）**
    *   模板注册表与版本管理（避免人工维护路径/文件）
    *   确认点变更审计与差异对比
    *   高风险点 AI 抽样复核（成本可控）
3.  **V2（可运营）**
    *   引入权限/工作流（分配审核人、复核状态）
    *   数据报表（哪些确认点最常 fail、哪些条款最常被改）
