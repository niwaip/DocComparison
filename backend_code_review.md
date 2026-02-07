# 后端代码审查报告 (Backend Code Review Report)

**日期**: 2026-02-07
**审查对象**: `d:\workspace\DocComparison\backend\`

## 0. 目标与边界

### 0.1 目标
- 把当前后端从“可跑的原型”提升到“可持续迭代的工程”，做到可测试、可重构、可部署、可回滚。
- 在不影响现有功能的前提下，先解决最影响长期迭代的结构性问题：目录污染、数据/产物混入源码、缺失自动化测试。

### 0.2 不在范围（本报告不直接落地的内容）
- 不引入复杂基础设施（数据库、消息队列、分布式追踪等），除非中期阶段明确需要。
- 不对业务算法（文档解析、对齐、规则校验、LLM 逻辑）做行为级修改；所有改动优先保证行为不变。

## 1. 总体评估 (Overall Assessment)
**核心架构设计合理，但工程化规范较差（"代码裸奔"）。**
后端采用了标准的 FastAPI + Service Layer 分层架构，逻辑清晰。但是，项目曾存在明显的工程化短板：目录污染、数据/产物混入源码目录、缺少回归保障，导致“可跑但不敢改”。目前已完成一批 Quick Wins（调试脚本搬迁、路由按域拆分、建立最小自动化测试），整体正从原型态向可持续迭代收敛。

## 2. 现状证据 (Evidence)

### 2.1 目录污染（调试脚本混入源码根目录）
已整改：调试脚本已从 `backend/app/` 迁移至 `backend/debug/`，不再污染应用代码目录。
`backend/debug/` 下仍保留调试脚本（仅供开发者手动运行，默认不参与部署/测试）：
- `backend/debug/debug_blocks.py`
- `backend/debug/debug_raw.py`
- `backend/debug/debug_indent.py`
- `backend/debug/debug_indent_fix.py`
- `backend/debug/debug_numbering.py`
- `backend/debug/debug_sales_indent.py`
- `backend/debug/debug_text_utils.py`
- `backend/debug/debug_e2e_align.py`
- `backend/debug/debug_python_docx.py`

### 2.2 数据/产物混入源码目录
`backend/app/` 同级存在大量运行产物与样例数据文件（应与源码隔离）：
- 运行时配置/数据：`backend/app/prompts.json`、`backend/app/templates.json`、`backend/app/rulesets.json`
- 文档样例：`backend/app/test_doc.docx`、`backend/app/test_doc_sales.docx`、`backend/app/test_doc_secrecy.docx`
- 解析分析产物：`backend/app/pandoc_*.txt`、`backend/app/python_docx_analysis*.txt`
- 运行记录：`backend/app/artifacts/check_runs/*.json`

已整改（运行数据路径收口 + 兼容旧路径）：
- 默认将运行数据写入 `backend/data/`（无需环境变量）。
- 支持通过环境变量 `DOC_COMPARISON_DATA_DIR` 指定运行数据目录：
  - store：`${DOC_COMPARISON_DATA_DIR}/store/`（prompts/templates/rulesets）
  - assets：`${DOC_COMPARISON_DATA_DIR}/assets/`（模板 docx 资产）
  - artifacts：`${DOC_COMPARISON_DATA_DIR}/artifacts/`（check runs）
- 兼容策略：如旧路径文件存在，会自动迁移到新路径，避免一次性迁移失败导致不可用。

已完成搬迁（避免继续污染 `backend/app/`）：
- `prompts.json/templates.json/rulesets.json` 已迁移到 `backend/data/store/`
- `test_doc*.docx` 已迁移到 `backend/data/samples/`
- `artifacts/check_runs/*.json` 已迁移到 `backend/data/artifacts/check_runs/`

仍建议后续处理（未强制落地）：
- 将 `backend/app/` 下残留的工具脚本（如 `export_pandoc.py`）逐步迁移到 `backend/debug/` 或 `backend/scripts/`（避免与应用代码混在一起）。

### 2.3 路由聚合导致单文件过大
已整改：`backend/app/api/endpoints.py` 已改为 router 聚合入口；按域拆分到多个 router 文件，URL 保持不变：
- documents（parse/diff）：`backend/app/api/routers/documents.py`
- templates：`backend/app/api/routers/templates.py`
- prompts：`backend/app/api/routers/prompts.py`
- skills（import/export）：`backend/app/api/routers/skills.py`
- checks（rulesets/check run）：`backend/app/api/routers/checks.py`

### 2.4 安全默认值偏“开发态”
`backend/app/main.py` 当前 CORS 为全开放：
- `allow_origins=["*"]`
- `allow_methods=["*"]`
- `allow_headers=["*"]`

### 2.5 文件存储策略的现状与隐患
当前 `templates/rulesets/prompts/check_runs` 均采用本地文件持久化，并使用 `tmp + os.replace` 的方式进行原子写入（优点：单进程/单机环境可靠）：
- `backend/app/services/prompt_store.py`
- `backend/app/services/template_store.py`
- `backend/app/services/check_service.py`（持久化 check run）

潜在隐患：
- 多进程（例如 uvicorn workers>1）或并发写入时，缺少文件锁/事务，仍可能出现覆盖/竞争。
- 源码目录承载运行数据，使得部署、容器化、CI 与代码审查都变得更困难。

## 3. 详细维度分析 (Detailed Analysis)

### 3.1 职责分离 (Separation of Duties) - ⭐⭐⭐⭐ (4/5)
*   **优点**：
    *   **分层清晰**：代码严格遵循了 `api` (路由入口) -> `services` (业务逻辑) -> `models` (数据定义) -> `core` (配置) 的分层结构。
    *   **各司其职**：例如 `endpoints.py` 只负责 HTTP 请求处理，具体的文档解析交给 `DocService`，LLM 交互交给 `LLMService`。这种设计非常符合“高内聚低耦合”的原则。
*   **改进点**：
    *   已整改：路由已按域拆分为多个 router 文件，`endpoints.py` 作为聚合入口，避免单文件过大。

### 3.2 易扩展性 (Extensibility) - ⭐⭐⭐ (3/5)
*   **优点**：
    *   由于业务逻辑封装在 Service 层，新增功能（如新增一个 LLM 厂商或新的比对算法）通常只需要增加新的 Service 方法或类，而不需要大幅修改 API 层。
*   **风险**：
    *   **缺乏测试保障重构**：扩展功能往往伴随着重构。由于没有测试用例，任何扩展都可能无意中破坏现有功能（Regression），导致实际上“不敢改、难扩展”。

### 3.3 健壮性 (Robustness) - ⭐⭐ (2/5)
*   **优点**：
    *   使用了 **Pydantic** (`models.py`) 进行强类型的数据验证，这是 FastAPI 的一大优势，保证了输入输出的数据结构安全。
    *   核心逻辑中有基本的 `try...except` 异常捕获。
*   **改进点**：
    *   **缺乏输入边界检查**：很多逻辑默认输入是“善意”的。例如文件上传只简单检查了后缀名。
    *   **缺乏错误恢复机制**：目前多是直接抛出 HTTP 500 错误，缺乏更细粒度的错误码设计。

### 3.4 文件组织和命名 (File Organization & Naming) - ⭐ (1/5)
**这是目前最糟糕的部分。** `backend/app/` 目录就像一个杂乱的储物间。
*   **目录污染已缓解**：`debug_*.py` 已从 `backend/app/` 迁移到 `backend/debug/`（源码目录洁净度明显改善）。
*   **数据代码混杂仍需持续治理**：`prompts.json`, `templates.json`, `rulesets.json` 已支持通过 `DOC_COMPARISON_DATA_DIR` 外置存储；但样例 `.docx` 与运行产物目录仍建议继续迁移到独立 data/artifacts 目录。
*   **不规范的脚本**：`export_pandoc.py`, `decode_native.py` 看起来是工具脚本，却伪装成核心代码文件。

### 3.5 测试用例 (Test Cases) - 🌑 (0/5)
*   **已整改（最小测试体系已建立）**：已新增 `backend/tests/`，并提供可重复执行的自动化测试用例（基于 `unittest`，不依赖额外测试框架安装）。
*   **覆盖范围（第一批）**：
    *   `skill_bundle` 导入导出（包括冲突分支）
    *   `template_store` / `ruleset_store` / `prompt_store` 的基本读写回归
    *   路由存在性回归（防止拆分路由后 URL 丢失）
*   **仍建议**：后续若 CI/团队习惯偏向 `pytest`，可再切换或双栈支持；但当前以“能稳定跑起来”为第一优先级。

## 4. 可落地整改方案 (Action Plan)

为避免“大手术”导致功能回归，建议分阶段推进，每阶段都有明确验收标准与回滚策略。

### 4.1 阶段划分与优先级

#### 阶段 A：Quick Wins（0.5～1 天，目标：行为不变）
1) 目录与产物隔离（只搬家、不改业务逻辑）
2) 明确运行数据目录（data/artifacts 与源码分离的约定）

#### 阶段 B：短期（1 周，目标：可重构）
1) 建立最小测试体系（unittest/pytest + 关键用例）
2) 路由按域拆分（降低单文件耦合）
3) 收紧“开发态默认值”（至少把 CORS 与配置外置）

#### 阶段 C：中期（2～4 周，目标：可部署与可观测）
1) 存储层演进（文件锁/单写者策略，或引入轻量数据库）
2) 可观测性（结构化日志、请求耗时、关键异常分类）

### 4.2 任务清单（可直接按卡片执行）

#### A1. 清理战场：调试脚本与工具脚本搬迁
- 将 `backend/app/debug_*.py` 迁移到 `backend/debug/` 或 `backend/scripts/`（不参与运行时镜像/部署）。
- 统一脚本入口方式（例如用相对路径与参数，不硬编码绝对路径）。

#### A2. 清理战场：样例与产物迁移
- 将 `backend/app/test_doc*.docx` 迁移到 `backend/data/samples/`。
- 将 `backend/app/pandoc_*.txt` 与 `backend/app/python_docx_analysis*.txt` 迁移到 `backend/data/analysis_outputs/`。
- 将 `backend/app/artifacts/` 明确为运行产物目录（建议迁移到 `backend/data/artifacts/`，并支持环境变量配置）。

#### A3. 运行数据路径收口（prompts/templates/rulesets）
- 将 `prompts.json/templates.json/rulesets.json` 的路径从 `backend/app/` 收口到一个明确的 data 目录（例如 `backend/data/store/`）。
- 兼容策略：迁移期先尝试读取新路径；若不存在则读取旧路径并写回新路径，避免一次性迁移失败导致不可用。

#### B1. 建立最小测试体系
- 增加 `backend/tests/` 并引入最小自动化测试（当前采用 `unittest`）。
- 第一批必须覆盖（优先级从高到低）：
  1) `skill_bundle` 导入导出（包括校验失败分支）
  2) `template_store` / `ruleset_store` 基本读写
  3) `check_service` 的“空 ruleset / 基础规则”路径
-
- 一键运行示例：
  - `python -m unittest discover -s tests -p "test_*.py" -v`

#### B2. 路由拆分（以域为单位）
- 将 `backend/app/api/endpoints.py` 拆分为多个 router 文件，例如：
  - documents（parse/diff）
  - templates
  - rulesets / check
  - prompts
  - skills（import/export）
- 目标：每个 router 文件职责单一，便于后续鉴权/限流/监控按域添加。

#### B3. 配置与安全默认值调整
- CORS 不再默认 `*`，至少通过环境变量白名单配置（开发与生产分离）。
- 对上传文件的校验从“只看后缀”提升到“可控的内容校验/大小限制/异常分类”。

### 4.3 验收标准（每阶段都有 Done Definition）

#### 阶段 A（目录整改）
- `backend/app/` 仅保留可导入的应用代码与必要配置，不再包含 `debug_*.py`、`test_doc*.docx`、`pandoc_*.txt`、`python_docx_analysis*.txt`。
- 后端服务能正常启动，核心接口（parse/diff/templates/check/skills）行为保持一致。
- 运行产物（check_runs 等）落到独立目录，不污染源码目录。

#### 阶段 B（测试与重构）
- 存在 `backend/tests/`，并能一键运行测试（例如 `unittest` 或 `pytest`）。
- 至少包含 8～15 个可重复执行的自动化测试用例，覆盖导入导出与存储读写的关键路径。
- `endpoints.py` 不再作为“全功能聚合”，路由按域拆分完成。

现状对齐：
- 已实现 `backend/tests/` 与可一键运行的 `unittest` 测试命令。
- 已完成路由按域拆分（documents/templates/prompts/skills/checks），并通过路由存在性测试兜底。

#### 阶段 C（可部署与可观测）
- 配置（尤其是 CORS、数据目录、模型 key）均通过环境变量/配置文件管理，不需要改代码切换环境。
- 有结构化日志与关键路径耗时输出，便于排查问题。

### 4.4 风险与回滚策略

#### 主要风险
- **路径变更风险**：移动 `prompts/templates/rulesets` 与样例文件会影响读取路径。
- **并发写入风险**：多 worker 场景下 JSON 文件存储可能出现竞争覆盖。
- **路由拆分风险**：拆文件时容易改动路径或 response_model，导致前端调用回归。

#### 回滚策略
- 路径迁移采用“新路径优先 + 旧路径兼容读取”的双读策略，确保升级可回滚。
- 路由拆分严格保持 URL 不变（只移动代码位置），配合自动化测试与最小 E2E 调用验证。
