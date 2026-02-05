# 项目重构设计文档 (Refactoring Design Document)

## 1. 概述
本项目旨在构建一个 AI 驱动的合同分析与比对工具。为提高系统的可维护性、扩展性及对 LLM（大语言模型）的深度支持，我们将对现有架构进行重构，实行**前后端分离**，并采用 **Python** 作为后端核心语言。

## 2. 技术选型与评估

### 2.1 文档转换引擎评估：Mammoth.js (Node.js) vs Pypandoc (Python)

针对法律合同文档（.docx）的特性，我们对比了两种主流转换方案：

| 特性 | Mammoth.js / mammoth (Python) | Pypandoc (Pandoc wrapper) |
| :--- | :--- | :--- |
| **核心理念** | **语义优先**。旨在生成干净的 HTML。它会尝试将 Word 样式（如 "Heading 1"）映射为 HTML 标签（`<h1>`），而忽略具体的字体、颜色等视觉样式。 | **通用转换**。旨在尽可能保留文档的所有结构和格式信息，能够处理极其复杂的文档结构。 |
| **对合同的适应性** | **中等**。如果合同文档严格使用了 Word 样式（Styles），效果极佳。但现实中的合同往往存在大量“手动格式化”（如手动加粗作为标题，而非使用标题样式），Mammoth 可能会丢失这些结构信息。 | **高**。Pandoc 能更好地保留手动格式化（如 `<strong>`、`<em>`、缩进等），这对于后续通过规则或 AI 识别文档结构至关重要。 |
| **输出质量** | 极其干净，易于前端展示。 | 较为冗杂，包含大量保留格式的 HTML 标签，需后期清洗，但**信息丢失率低**。 |
| **生态整合** | Node.js 生态原生。 | Python 生态整合良好（需安装 Pandoc 二进制）。 |

**结论与决策**：
鉴于法律合同格式的多样性与不规范性，以及我们需要尽可能保留文档的“原始面貌”以供 AI 分析，**Pypandoc** (配合 Python 后端) 是更安全、更强大的选择。它可以最大限度地避免因文档样式不规范而导致的信息丢失。
此外，Python 在 **LLM (大模型)**、**NLP (自然语言处理)** 及 **OCR** 领域的绝对统治地位，也决定了后端必须迁移至 Python。

### 2.2 核心技术栈

*   **前端 (Frontend)**:
    *   **框架**: React + TypeScript + Vite
    *   **UI 库**: Shadcn/UI + Tailwind CSS (现代化、轻量)
    *   **状态管理**: Zustand 或 React Query
    *   **职责**: 负责 UI 展示、交互、文档预览、Markdown 渲染。
*   **后端 (Backend)**:
    *   **框架**: **FastAPI** (高性能、异步支持、自动生成文档)
    *   **文档处理**: `pypandoc` (转换), `python-docx` (元数据提取), `unstructured` (复杂版面分析)
    *   **LLM 集成**: `LangChain` 或 `OpenAI SDK`
    *   **职责**: 文档解析、结构化数据提取、LLM 交互、业务逻辑。
*   **数据存储 (Database)**:
    *   **SQLite** (初期/单机) 或 **PostgreSQL** (生产环境)
    *   ORM: SQLModel 或 SQLAlchemy

## 3. 系统架构设计

### 3.1 架构图
```mermaid
graph TD
    User[用户] --> Frontend[前端 (React/Vite)]
    Frontend -- REST API --> Backend[后端 (FastAPI)]
    
    subgraph Backend Services
        API[API 层] --> Controller[控制器]
        Controller --> Service[业务逻辑层]
        
        Service --> DocEngine[文档引擎 (Pypandoc/Unstructured)]
        Service --> LLMEngine[LLM 引擎 (OpenAI Compatible)]
        
        LLMEngine --> TraceSystem[轨迹追踪 (Traceability)]
    end
    
    DocEngine --> FS[文件系统]
    Service --> DB[(数据库)]
```

### 3.2 关键模块设计

#### A. 文档处理流水线 (Pipeline)
1.  **上传**: 用户上传 `.docx`。
2.  **转换 (Raw Conversion)**: 使用 `pypandoc` 将 `.docx` 转换为 HTML/Markdown。
3.  **清洗与分块 (Cleaning & Chunking)**:
    *   基于 HTML 结构（H1-H6, p, li）进行逻辑分块。
    *   针对“合同”特有的中文编号（一、(一)、1.）进行正则增强识别，弥补转换过程中的语义缺失。
4.  **存储**: 保存 原文、解析后的 HTML、以及分块后的 JSON 数据。

#### B. LLM 集成与轨迹流动 (Traceability)
为了满足“轨迹流动”的需求，我们需要知道 AI 的每一个回答是基于文档的哪一部分，以及 AI 的思考过程。

*   **设计方案**:
    1.  **Trace ID**: 每个请求生成唯一的 `trace_id`，贯穿整个调用链。
    2.  **LangSmith / Custom Logger**: 记录 LLM 的 `Prompt` (输入) 和 `Completion` (输出)。
    3.  **引用锚点 (Citations)**:
        *   在 Prompt 中注入文档块时，附带 Block ID (如 `<block id="123">...text...</block>`)。
        *   要求 LLM 在回答时引用 Block ID。
        *   前端解析回答中的 Block ID，实现“点击高亮原文”的轨迹回溯。

### 3.3 目录结构规划
```text
DocComparison/
├── frontend/               # 前端项目 (React)
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── backend/                # 后端项目 (Python/FastAPI)
│   ├── app/
│   │   ├── main.py         # 入口
│   │   ├── api/            # 路由
│   │   ├── core/           # 配置、日志
│   │   ├── services/       # 业务逻辑 (DocService, LLMService)
│   │   ├── models/         # 数据库模型
│   │   └── utils/          # 工具 (pandoc_wrapper.py)
│   ├── requirements.txt
│   └── Dockerfile
├── docs/                   # 项目文档
├── docker-compose.yml      # 服务编排
└── README.md
```

## 4. 迁移与重构计划

1.  **阶段一：后端基础设施搭建 (MVP)**
    *   初始化 FastAPI 项目。
    *   实现文件上传接口。
    *   集成 `pypandoc` 实现基础的 Docx -> HTML 转换。
    *   验证转换效果是否满足“章节编号”的识别需求。

2.  **阶段二：核心解析逻辑迁移**
    *   将原 Node.js 中的 `blocks.ts` 分块逻辑迁移至 Python。
    *   利用 Python 强大的正则和文本处理能力，优化“中文合同编号”的识别算法。

3.  **阶段三：LLM 能力接入**
    *   封装 OpenAI 兼容接口。
    *   实现基于 Block ID 的引用机制（轨迹流动）。

4.  **阶段四：前端对接**
    *   搭建 React 前端，实现手动 `npm run dev` 启动。
    *   对接后端 API，展示解析结果。

## 5. 开发环境说明
*   **手动管理前端**: 开发阶段，前端不通过 Docker 启动，而是由开发者在宿主机运行 `npm run dev`，以便获得最快的 HMR (热更新) 体验。
*   **后端服务**: 建议通过 Docker 运行数据库等依赖服务，Python 后端可本地运行或 Docker 运行。

