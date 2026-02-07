# 前端代码优化建议报告

根据对 `d:\workspace\DocComparison\frontend\` 目录下的代码审查，基于代码可维护性、可扩展性和健壮性的最佳实践，提出以下改善建议。

## 1. 代码结构与模块化 (Code Structure & Modularization)

### 现状分析
`App.tsx` 虽然已经进行了初步拆分（如 `CheckPanel`, `GlobalAnalyzePanel`），但仍然保留了大量的布局逻辑、状态管理和事件处理代码，导致文件体积依然较大，阅读和维护成本较高。

### 优化建议
1.  **进一步拆分 `App.tsx`**:
    *   **顶部/侧边操作栏**: 将 `.side-actions` 区域的代码提取为独立的 `SideActions.tsx` 或 `ControlPanel.tsx` 组件。
    *   **对比视图**: 将差异对比表格（Table 及其 Row 渲染逻辑）提取为 `DiffViewer.tsx` 或 `DiffTable.tsx`。
    *   **状态抽离**: 优先将状态/动作按领域拆分（例如 reducer 分域 + hooks 下沉）；当复杂度继续上升时再评估引入轻量级状态库（如 Zustand），减轻 `App.tsx` 的负担。

2.  **功能目录重组**:
    *   当前 `src/features` 结构良好，建议继续深化。例如将对比相关的组件统一归档到 `src/features/compare/` 下。

## 2. 类型安全 (Type Safety)

### 现状分析
在 `src/api.ts` 和部分组件交互中，仍然存在 `any` 类型的使用（例如 `fetchJson<any[]>` 或数据处理中的 `x: any`）。这削弱了 TypeScript 的类型保护优势，容易在运行时引发 "undefined is not a function/property" 等错误。

### 优化建议
1.  **定义严格的 API 接口**:
    *   为所有后端 API 的请求参数和响应数据定义明确的 `interface` 或 `type`。
    *   例如，将 `TemplateListItem` 的定义完善，并在 `api.templates.list` 中严格使用，而不是在函数内部进行 `any` 转换。
2.  **消除 `any`**:
    *   制定计划逐步替换 codebase 中的 `any` 为具体类型。对于暂时无法确定的类型，优先使用 `unknown` 并配合类型守卫（Type Guards）进行收窄。

## 3. 样式与 UI 一致性 (Styling & UI Consistency)

### 现状分析
UI 样式部分存在于全局 `App.css`，部分可能混杂在组件内部。部分 UI 元素（如 Select, Button）的高度和对齐方式需要手动调整（如最近修复的 44px 高度对齐）。

### 优化建议
1.  **提取基础组件**:
    *   封装通用的 UI 原子组件，如 `BaseButton`, `BaseSelect`, `BaseCard`。将高度、圆角、字体颜色等样式固化在组件内部，确保全局 UI 风格统一，避免每次开发新功能都需要手动写 CSS 来对齐。
2.  **CSS 变量/主题**:
    *   定义全局 CSS 变量（Root Variables）来管理颜色、间距和字号。例如 `--primary-color`, `--spacing-md`。这样在需要调整主题或统一间距时，只需修改一处。

## 4. 健壮性与错误处理 (Robustness & Error Handling)

### 现状分析
目前的错误处理主要依赖 `console.error` 或局部的 `try-catch`。缺乏统一的用户反馈机制（如 Toast 提示）和统一的 API 错误拦截。

### 优化建议
1.  **全局错误边界 (Error Boundaries)**:
    *   在 React 组件树顶层引入 Error Boundary，防止局部组件渲染错误导致整个页面白屏。
2.  **统一 API 错误处理**:
    *   在 `api.ts` 的 `fetchJson` 基础函数中，统一处理 HTTP 错误状态（4xx, 5xx）。
    *   引入全局提示机制（如 `Sonner` 或 `React-Toastify`），当 API 失败时自动向用户展示友好的错误信息，而不是仅在控制台报错。

## 5. 遗留代码清理 (Legacy Code Cleanup)

### 现状分析
项目中存在 `src/legacy` 目录以及 `flags.ts` 中的特性开关（Feature Flags），用于兼容旧版本功能。

### 优化建议
1.  **制定清理计划**:
    *   一旦新版功能（如 V2 Rules Modal）经过充分验证并稳定运行，应立即安排任务删除 `ContractRulesModalLegacy.tsx` 及相关的 Feature Flag 代码。保留过期的死代码会增加认知负荷和维护成本。

## 6. 测试策略 (Testing Strategy)

### 现状分析
`api.test.ts` 覆盖了基础的 API 逻辑，但 UI 组件的交互逻辑测试相对较少。

### 优化建议
1.  **增加组件测试**:
    *   利用已配置好的 Vitest，优先补齐可测的业务逻辑与数据归一化测试；如后续确实需要覆盖复杂交互，再评估引入 React Testing Library 来写组件测试。
2.  **Mock 数据管理**:
    *   统一管理测试用的 Mock 数据，避免在每个测试文件中重复构造复杂的 JSON 对象。

---

# 可执行落地计划（用于推进与验收）

本计划以“不引入新依赖也能落地”为默认原则；需要新增依赖的项统一放在“可选增强”里。每个阶段都有清晰的产出与验收口径，便于按周推进。

## 总体目标（Definition of Done）

- `npm run lint`、`npm run test`、`npm run build` 全部通过
- `src/` 关键链路（对比、检查、分析、规则配置）功能不回退
- `App.tsx` 继续瘦身：布局/渲染/业务逻辑尽量下沉到 feature 组件或 hooks
- API 层逐步消除 `any`：新增代码不再引入 `any`（存量分阶段偿还）
- 变更以“小步快跑”为主：每次改动可独立回滚、可单独验收

## 阶段 0：建立基线（0.5 天）

**产出**
- 记录当前主流程手动回归清单（对比/检查/分析/规则配置/主题切换）
- 跑通并记录一次命令输出（用于后续对比）

**验收**
- 以下命令在本机可稳定运行：
  - `npm run lint`
  - `npm run test`
  - `npm run build`

## 阶段 1：继续拆分 App.tsx（1–2 天）

目标：把“结构化 UI + table 渲染 + 交互事件”拆出，降低 `App.tsx` 认知负担。

**建议拆分顺序（按收益/风险排序）**
1. Diff 表格渲染：抽出 `DiffTable`（含 Row 渲染与高亮/滚动定位相关 props）
2. 侧边操作区：抽出 `SideActions`（合同类型、开关、开始对比/重置等）
3. 中间工具条：抽出 `MidToolbar`（仅展示差异、上一处/下一处、检查栏开关等）

**验收**
- `App.tsx` 主要只负责：组合组件、持有少量顶层状态、组织数据流
- 拆分出的组件 props 清晰（避免把所有 state 一股脑传下去）
- `npm run lint/test/build` 通过

## 阶段 2：API 类型与数据收敛（1 天）

目标：不引入运行时校验库的前提下，把 API 的 “unknown -> type guard -> domain type” 走通。

**落地要点**
- `fetchJson<T>` 的返回值在调用处先用 `unknown` 接，再用类型守卫收敛
- 为模板列表、规则集、全局分析等响应结构补齐最小可用的 type guard（只校验用到的字段）
- 将“默认值填充/归一化逻辑”集中在 api 层，UI 层尽量只消费已归一化的 domain 类型

**验收**
- `src/api.ts` 新增/改动处不再使用 `any`
- 关键 API 调用在异常/字段缺失时仍能稳定降级（返回空数组/`null`/可显示的错误）
- `src/api.test.ts` 增加覆盖：至少覆盖 1 个异常分支（非数组、字段缺失、500 等）

## 阶段 3：错误处理与用户反馈统一（0.5–1 天）

目标：把错误处理从“零散 setError/console.error”统一成可复用模式，减少漏处理。

**不引入新依赖的方案（推荐先做）**
- 在 API 层输出更结构化的错误信息（例如统一 `Error` message 格式或返回 `null`/空数组并携带可显示信息）
- 在 UI 层把错误展示统一到 1 个组件（例如 `InlineErrorBanner`），减少重复 UI

**验收**
- 关键链路错误（模板列表加载、对比、检查、分析、规则保存）都有一致的用户可见反馈
- 不依赖控制台才能定位问题（页面能看到可读错误）

## 阶段 4：样式收敛与一致性（1 天）

目标：把“散落的内联样式 / `<style>` 规则”收敛到更可复用的风格体系，避免反复对齐。

**落地策略（不引入 UI 框架）**
- 先从最常用控件入手：Button/Select/Switch 的高度、padding、字体、disabled 态
- 将重复样式下沉到少量 class（例如 `control`, `control--primary`, `panel`），减少行内 style
- 以“组件拆分”为契机：样式随组件就近收敛（同一组件内不重复定义相同 style）

**验收**
- 新增功能不需要再手动调 44px 对齐（有统一 class/变量可复用）
- 对比视图在 light/dark 下可读性一致（边框/背景/文本对比度）

## 阶段 5：测试扩展（0.5–1 天）

目标：在不引入 React Testing Library 的情况下，优先把“高价值、低成本”的测试补齐。

**推荐补齐点**
- API 归一化：输入脏数据 -> 输出稳定结构
- 纯函数/工具函数：`textUtils`、`fieldDetection`（如果存在明显分支）
- Reducer（如果阶段 1/2 拆出了 reducer）：action -> state 的关键分支

**验收**
- `npm run test` 覆盖至少新增 5–10 个断言（按关键分支计数）
- 出现后端字段缺失/类型变化时，测试能第一时间暴露问题

## 阶段 6：清理遗留代码（0.5 天）

目标：在确认 V2 稳定后移除 legacy 代码，减少维护面。

**落地要点**
- 先做“只读清理”：删除未引用的 legacy 组件/开关分支
- 如仍需要灰度：保留 flag，但明确收敛期限（例如 1–2 个迭代后移除）

**验收**
- `src/legacy` 中无实际运行路径（或已删除）
- `flags.ts` 中与 legacy 相关的 flag 精简或移除

## 可选增强（需要新增依赖，放到最后评估）

- 状态管理：Zustand（当 reducer 拆分仍难以维护时再引入）
- 组件测试：React Testing Library（当交互逻辑复杂且回归成本上升时再引入）
- 网络 Mock：MSW（当 API 分支复杂、希望更接近真实交互时再引入）
- 全局 Error Boundary：`react-error-boundary`（或自写 class ErrorBoundary），用于兜底渲染异常
