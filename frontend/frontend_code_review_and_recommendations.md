# 前端代码库审查与优化建议报告

## 1. 架构与状态管理 (Architecture & State Management)

### 现状观察
- **"God Component" 模式**: `App.tsx` 似乎承担了过多的职责，包含了一个巨大的 `AppState` 类型（约 40+ 字段），集中管理了几乎所有的应用状态（UI 状态、数据状态、配置状态）。
- **Props Drilling**: 由于状态集中在顶层，大量的数据和回调函数通过 Props 层层传递给子组件（如 `DiffTable`, `CheckPanel` 等），导致组件耦合度高，难以重构和测试。
- **混合职责**: 业务逻辑（如数据处理、API 调用结果解析）与 UI 渲染逻辑紧密耦合在组件内部。

### 优化建议
- **引入状态管理库**: 建议引入轻量级状态管理库（如 **Zustand** 或 **Jotai**）或使用 **React Context** 将状态拆分。
  - **Global UI State**: 如 `theme`, `lang`, `uploadPaneCollapsed` 可以放入全局 Store。
  - **Domain State**: 如 `checkRun`, `diffRows` 可以放入专门的 Domain Store。
- **采用 React Query (TanStack Query)**: 目前 `api.ts` 中手动处理加载状态 (`loading`, `checkLoading`) 和错误处理。引入 React Query 可以自动管理服务端状态（Caching, Loading, Error, Stale-while-revalidate），大幅减少 `App.tsx` 中的样板代码。
- **逻辑抽离 (Custom Hooks)**: 将复杂的业务逻辑（如文件上传解析、比对逻辑）抽离为自定义 Hooks（如 `useDocumentCompare`, `useRuleset`），让组件专注于渲染。

## 2. 组件设计 (Component Design)

### 现状观察
- **组件体积**: `App.tsx` 代码量较大，包含大量 `useEffect` 和回调。
- **渲染逻辑耦合**: `DiffTable.tsx` 中包含复杂的表格列宽计算和内联样式逻辑，使得代码难以阅读。
- **Legacy 代码**: 存在 `src/legacy` 目录，表明有未完成的重构。

### 优化建议
- **原子化设计 (Atomic Design)**: 将通用组件（如 Button, Input, Modal 基础壳）提取到 `components/ui` 或 `components/common` 目录，与业务组件（`features/`）分离。
- **Slot 模式 (Composition)**: 减少 Props 传递，更多使用 `children` 或 `render props` 模式。例如 `HeaderBar` 可以接受 `actions` 作为 children，而不是硬编码具体的按钮回调。
- **清理 Legacy**: 制定计划逐步移除 `legacy` 目录，确保新旧逻辑不混用，避免维护负担。

## 3. 样式方案 (Styling)

### 现状观察
- **大量内联样式**: 代码中（如 `DiffTable.tsx`, `App.tsx`）存在大量 `style={{ ... }}`，这不仅影响渲染性能（每次渲染创建新对象），也难以维护和复用。
- **CSS 变量**: 使用了 CSS 变量（如 `var(--panel)`），这是好的实践，但分散在各个文件中。

### 优化建议
- **CSS Modules 或 Tailwind CSS**:
  - **方案 A (Tailwind CSS)**: 推荐使用。它可以极大减少 CSS 文件体积，解决命名冲突，并提供一致的设计系统约束。
  - **方案 B (CSS Modules)**: 如果偏好传统 CSS，使用 CSS Modules (`*.module.css`) 将样式局部化，避免全局污染。
- **样式提取**: 将 `DiffTable` 中的列宽计算逻辑移至 CSS Grid 或 CSS 变量中，通过 class 控制布局变化，减少 JS 里的样式计算。

## 4. 类型安全与数据验证 (Type Safety & Validation)

### 现状观察
- **手动类型守卫**: `api.ts` 中包含大量手动编写的解析函数（`asRulesetAnchor`, `asRulesetPoint` 等）。这种方式虽然类型安全，但编写繁琐且容易出错，难以维护。
- **类型定义集中**: `src/domain/types.ts` 集中了所有类型，随着项目增长会变得难以管理。

### 优化建议
- **引入 Zod 进行运行时验证**: 使用 **Zod** 定义 Schema，自动推导 TypeScript 类型，并直接用于 API 响应验证。
  ```typescript
  // 示例
  const RulesetAnchorSchema = z.object({
    type: z.enum(['structurePath', 'textRegex']),
    value: z.string()
  });
  type RulesetAnchor = z.infer<typeof RulesetAnchorSchema>;
  ```
  这样可以删除 `api.ts` 中数百行的手动解析代码，且更健壮。
- **类型拆分**: 按领域拆分类型文件，例如 `src/domain/check/types.ts`, `src/domain/template/types.ts`。

## 5. 代码质量与工程化 (Code Quality & Engineering)

### 现状观察
- **API 封装**: `api.ts` 封装了 HTTP 请求，但返回的是 Promise，没有统一的拦截器处理（虽然有 `buildHttpError`）。
- **测试**: 已有 `tests/` 目录和 Vitest，这是一个很好的开始。

### 优化建议
- **统一 HTTP 客户端**: 考虑封装 `fetch` 或使用 `axios` 实例，统一处理 Token 注入、401 自动登出、全局错误提示等逻辑。
- **加强 Linting**: 确保 ESLint 配置包含 `react-hooks/exhaustive-deps` 和 `no-restricted-imports`（防止循环依赖）。
- **E2E 测试**: 引入 **Playwright** 或 **Cypress** 进行端到端测试，特别是针对核心的比对流程和规则配置流程，因为这些涉及复杂的用户交互。
- **错误边界 (Error Boundaries)**: `AppErrorBoundary` 是好的实践。建议粒度更细，在主要的功能区块（如 `GlobalAnalyzePanel`, `DiffTable`）包裹独立的 ErrorBoundary，防止局部错误导致整个页面崩溃。

## 6. 性能优化 (Performance)

### 现状观察
- **大列表渲染**: 文档比对可能产生大量行 (`rows`)。如果在 `DiffTable` 中直接渲染成千上万行 DOM，会导致页面卡顿。

### 优化建议
- **虚拟滚动 (Virtualization)**: 对于 `DiffTable`，强烈建议引入 **React Virtual** (TanStack Virtual) 或 **React Window**。只渲染视口内的行，显著提升大数据量下的性能。
- **Memoization**: 仔细检查 `App.tsx` 传递给子组件的对象/函数，使用 `useMemo` 和 `useCallback` 避免不必要的子组件重渲染。

## 总结 (Summary)

当前代码库功能完整，已有基本的模块划分（features, components），类型系统也较为完善。主要的改进空间在于**解耦**和**现代化开发体验**：

1.  **State**: 从单一的大 State 转向 Zustand/React Query。
2.  **Style**: 从内联样式转向 Tailwind/CSS Modules。
3.  **Validation**: 从手动解析转向 Zod。
4.  **Performance**: 引入虚拟滚动处理长列表。

这些改进不需要推倒重来，可以采取**渐进式重构**的策略，按模块逐个优化。
