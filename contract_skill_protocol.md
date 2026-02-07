# 合同 Skill 协议（Contract Skill Protocol）

版本：Draft v0.3（导入/导出 MVP 优先版）  
适用范围：标准合同的“设定”（模板 + 规则 + 提示词 + 测试）导出/导入  

---

## 1. 目标与边界

### 1.1 目标

将“标准合同”抽象为可移植、可验证、可审计、可版本化的 **合同 Skill**，支持：

- **导出**：把一份合同的能力与资源打包成独立包，便于分发/归档/回滚
- **导入**：在另一套环境中安装该合同 Skill，并保证行为尽可能一致
- **演进**：支持 schema 与 Skill 本身的语义化版本升级、兼容检查与迁移
- **安全**：将“赋予 LLM 额外能力”的部分收敛为显式声明的 capabilities，并做到最小权限

### 1.2 针对早期开发的特别设计（v0.2 新增）

鉴于系统校验逻辑（Checks）变动频繁，本协议采用 **“宽容解析”与“泛型配置”** 策略：

1.  **规则注册表化**：不硬编码规则字段，而是通过 ID 映射配置，允许 Host 动态支持新规则。
2.  **忽略未知字段**：Host 解析时遇到不认识的字段应 Log Warning 而非 Error，保障前向兼容。
3.  **保留扩展区**：所有核心对象均预留 `extensions` 字段，用于存放临时/实验性数据。

---

## 2. 术语

- **Host**：承载 Skill 的系统（你的合同平台）
- **合同 Skill（Contract Skill）**：用于“生成/校验/对比/审核提示”的能力包
- **Bundle**：Skill 的可分发打包产物（一个文件/压缩包）
- **Asset**：Bundle 内的二进制或静态资源（docx、pdf、图片等）
- **Normalized Template**：将 docx 等解析成稳定结构（blocks/sections）的结构化模板
- **Ruleset**：结构化校验规则集合（占位符、标题层级、删条款、块级规则等）
- **Prompt Pack**：面向 LLM 的提示词/约束/输出协议
- **Capability**：Host 提供的可调用能力（工具/检索/权限），Skill 只“声明需求”，Host 决定是否授权

---

## 3. 设计原则

1.  **结构化优先**：合同能力不应只是一段文本；关键结构应可 diff、可测试、可迁移。
2.  **可验证完整性**：Bundle 必须能做一致性校验（hash/签名）。
3.  **配置与实现分离**：Skill 只包含“规则的配置参数”，具体的“校验逻辑代码”在 Host 端。Skill 不应包含可执行代码（除了受限的 DSL）。
4.  **最小权限**：Skill 只能通过 capabilities 声明它“想要什么”。

### 3.1 规范性用语（建议）

为减少早期多人协作的实现分歧，本文使用以下规范性用语（即使是设计稿也建议保持一致）：  

- MUST：必须实现/必须满足，否则导入/导出不成立  
- SHOULD：强烈建议实现/满足，否则可能导致体验或兼容性问题  
- MAY：可选实现，用于增强能力或未来扩展  

---

## 4. Bundle 打包格式

### 4.1 容器格式

推荐：`*.cskill`（ZIP 格式）

### 4.2 标准目录结构

```
/
  manifest.json          # 总入口
  checksums.json         # 完整性校验
  signatures/            # 可选：签名与证书链
    manifest.sig
    checksums.sig
  assets/                # 原始文件
    template.docx
    template.pdf
  template/              # 结构化数据
    normalized.template.json
    placeholder.schema.json
  rules/                 # 规则配置
    ruleset.json
  prompts/               # 提示词
    pack.json
    *.md
  tests/                 # 回归测试
    cases.json
```

---

## 5. manifest.json（Skill 清单协议）

### 5.1 字段概览

```json
{
  "schemaVersion": "1",
  "kind": "contract-skill",
  "skillId": "com.yourorg.contract.sales_cn",
  "name": "买卖合同（销售）",
  "skillVersion": "0.1.0",
  "entrypoints": {
    "assets": {
      "authoritativeDocx": "assets/template.docx"
    },
    "template": {
      "normalized": "template/normalized.template.json",
      "placeholders": "template/placeholder.schema.json"
    },
    "rules": {
      "ruleset": "rules/ruleset.json"
    },
    "prompts": {
      "pack": "prompts/pack.json"
    }
  },
  "integrity": {
    "checksums": "checksums.json"
  },
  "capabilities": [
    {
      "capabilityId": "host.contract.compare",
      "scope": "read-only"
    }
  ],
  "extensions": {
    "x-ui-color": "#ff0000",
    "x-dev-note": "WIP"
  }
}
```

### 5.2 关键约束（用于导入/导出 MVP）

- Host MUST 以 `manifest.json` 作为 Bundle 唯一入口。
- Host MUST 支持 `schemaVersion = "1"`。
- `skillId` MUST 全局唯一；同一 `skillId` 的多个版本属于同一 Skill 的升级/回滚序列。
- `skillVersion` SHOULD 遵循语义化版本；早期可使用 `0.x` 表示不稳定。
- `entrypoints` 中引用的路径 MUST 存在且 MUST 被纳入 `checksums.json`。
- 为兼容早期试验，Host MAY 在导入时接受 `version` 作为 `skillVersion` 的别名，但导出时 SHOULD 统一输出 `skillVersion`。

---

## 6. rules/ruleset.json（规则协议 - 重点更新）

### 6.1 设计变更：从“硬编码”到“注册表”

为了适应 check 逻辑的频繁变化，不再在协议中定义 `heading` 或 `deletedClause` 等具体字段名，而是采用 **Rule ID 映射** 模式。

### 6.2 建议结构

```json
{
  "schemaVersion": "1",
  "globalRules": {
    "core.heading_level": { 
      "enabled": true, 
      "maxLevel": 2 
    },
    "core.placeholders_must_fill": { 
      "enabled": true,
      "exclude": ["optional_remark"]
    },
    "core.deleted_clause_detection": {
      "enabled": true,
      "threshold": 0.8
    },
    "experimental.table_integrity": {
      "enabled": true,
      "minColumns": 8
    }
  },
  "blockRules": {
    "b_0003": [
      {
        "ruleId": "core.content_constraint",
        "severity": "error",
        "params": {
          "mustContain": ["产品名称", "单价"],
          "forbid": ["旧版本术语"]
        }
      }
    ]
  }
}
```

### 6.3 优势

*   **无需升级协议**：当你在后端写了新的 check 逻辑（例如 `experimental.table_integrity`），只需在导出的 JSON 里加这一行配置。旧版本的 Host 读到这个 ID 发现不认识，直接跳过即可，不会报错。
*   **参数灵活**：`params` 内部结构由具体的 Rule ID 决定，协议层不做校验。

---

## 7. template（结构化模板协议）

### 7.1 normalized.template.json

建议增加 `_source` 或 `debug` 字段，方便在开发期追踪解析问题。

```json
{
  "blocks": [
    {
      "blockId": "b_0001",
      "kind": "paragraph",
      "text": "...",
      "stableKey": "...",
      "debug": {
        "originalXmlHash": "...",
        "parseTimeMs": 12
      }
    }
  ]
}
```

### 7.2 placeholder.schema.json

占位符定义应支持 `extensions`，以便 UI 能够灵活读取自定义配置（如控件类型、提示文案）。

```json
{
  "placeholders": [
    {
      "id": "signing_date",
      "type": "date",
      "required": true,
      "ui": {
        "widget": "datepicker",
        "format": "YYYY-MM-DD"
      }
    }
  ]
}
```

---

## 8. prompts（Prompt Pack 协议）

### 8.1 动态性支持

在开发早期，System Prompt 可能会每天改。

*   **建议**：Host 在导入 Prompt Pack 时，支持 **“Override 模式”**。即：如果数据库/配置中心里有针对该 Skill 的最新 Prompt 配置，优先使用数据库里的，而不是 Bundle 包里的静态文件。Bundle 里的仅作为“出厂默认值”。

```json
{
  "prompts": [
    {
      "promptId": "compare_explain",
      "files": {
        "system": "prompts/system.md"
      },
      "allowOverride": true
    }
  ]
}
```

---

## 9. 开发与调试（Dev Workflow）

为了支持快速迭代，建议在 Host 端实现 **“未打包加载（Unpacked Loading）”** 能力。

### 9.1 调试模式

*   **正常流程**：修改 -> 打包 .cskill -> 上传 -> 导入 -> 测试
*   **调试流程**：
    1.  在本地建立符合 Bundle 结构的文件夹。
    2.  Host 提供 API `POST /skills/dev/link`，参数为本地绝对路径（仅限 Localhost 开发环境）。
    3.  Host 直接读取磁盘文件。
    4.  修改本地 json/md，刷新页面/重新触发请求即可生效。

### 9.2 兼容性策略（Tolerance）

在代码解析 Skill 包时，必须遵循：

> **Postel's Law (Robustness Principle)**:
> "Be conservative in what you do, be liberal in what you accept from others."

*   遇到未知的 `ruleId` -> **Log Warning & Skip**
*   遇到未知的 `json` 字段 -> **Ignore**
*   导入 `.cskill` 时 `checksums` 不匹配 -> **MUST Fail**
*   使用 dev-link（本地文件夹加载）时 -> Host MAY 跳过 `checksums` 校验，但 MUST 明确标记为开发态来源（不可用于生产）  

---

## 10. 总结：应对变化的策略

1.  **Ruleset 泛型化**：用 `Map<RuleId, Config>` 代替强类型的 Struct。
2.  **Extensions 预留**：到处预留 `extensions` / `x-` 字段。
3.  **Soft Fail**：解析失败不要崩，降级处理。
4.  **Dev Mode**：支持加载文件夹，不做打包。

这个协议版本（v0.3）以导入/导出闭环为优先，即使在 Check 逻辑大改的情况下，也能保持文件格式的稳定，只需增减配置项即可。

---

## 11. 完整性与 checksums.json（导入/导出 MVP 必需）

### 11.1 checksums.json 结构（建议）

```json
{
  "schemaVersion": "1",
  "hashAlgorithm": "sha256",
  "files": {
    "manifest.json": "…",
    "checksums.json": "…",
    "assets/template.docx": "…",
    "template/normalized.template.json": "…",
    "template/placeholder.schema.json": "…",
    "rules/ruleset.json": "…",
    "prompts/pack.json": "…"
  }
}
```

### 11.2 规则

- `files` 的 key MUST 使用 Bundle 内的相对路径，并统一使用 `/` 作为分隔符（与 zip entry 一致）。
- `checksums.json` 本身 MUST 被纳入 `files`（自校验）。
- Host MUST 在导入 `.cskill` 时校验 `checksums.json` 与其引用的文件内容一致，否则导入失败。
- `signatures/` 为可选增强；早期导入/导出闭环可先不做签名，但 SHOULD 在进入生产分发前补上。

---

## 12. 导出（Export）语义（先实现这一版）

导出目标：从 Host 内已有的“标准合同设定”生成一个可移植 `.cskill` 文件。

### 12.1 导出输入（Host 内部）

- `skillId`、`skillVersion`、`name`
- 资源与配置：模板资源（docx/pdf）、normalized template、placeholders、ruleset、prompt pack（可选）、tests（可选）

### 12.2 导出输出（Bundle）

Host MUST 生成：

- `manifest.json`
- `checksums.json`
- `assets/*` 与 `template/*`、`rules/*`（按 entrypoints 需要）

Host SHOULD：

- 保持 zip 内路径稳定（同一路径，不随展示名变化），便于 diff 与回滚

### 12.3 导出流程（建议）

1.  生成 `manifest.json`（填充 entrypoints、integrity.checksums）。
2.  根据 `manifest.entrypoints` 收集所有文件并写入 zip。
3.  对 zip 内每个文件内容计算 sha256，生成 `checksums.json` 并写入 zip。
4.  重新计算并补齐 `checksums.json` 的自身 hash（自校验）。
5.  （可选）生成签名文件写入 `signatures/`。

---

## 13. 导入（Import）语义（先实现这一版）

导入目标：把 `.cskill` 安装到 Host，使其可被选择、可用于对比/校验/提示。

### 13.1 导入流程（MUST）

1.  读取 zip 并定位 `manifest.json`。
2.  校验 `manifest.schemaVersion` 与 `kind`。
3.  读取 `checksums.json`（由 `manifest.integrity.checksums` 指向）。
4.  对 `checksums.json.files` 列出的每个路径进行 sha256 校验，任何不匹配 MUST 导入失败。
5.  校验 `entrypoints` 所引用文件存在且已在 `checksums.json.files` 中。
6.  解析并安装 Skill（写入数据库或本地存储），以 `skillId + skillVersion` 作为版本键。

### 13.2 导入输出（Host 内部状态）

Host SHOULD 记录：

- `skillId`、`skillVersion`
- `bundleDigest`（例如 `checksums.json` 的 sha256 或其 canonical 表示的 hash）
- 安装时间、安装者、来源（upload / dev-link）

---

## 14. 冲突处理（同 skillId 的导入策略）

导入时如果 `skillId` 已存在：

- Host MUST 支持 **install-as-new-version**：同一 `skillId` 不同 `skillVersion` 并存。
- Host MUST 支持 **overwrite-same-version** 的显式选项：仅当 `skillId + skillVersion` 相同且操作者明确选择覆盖时才允许。
- Host MAY 支持 **fork**：生成新 `skillId`（例如追加组织/环境后缀）用于试验。

Host SHOULD 对覆盖行为保留审计记录。
---

## 15. 早期开发的兼容性策略（不阻碍导入/导出闭环）

- Host MUST 忽略 `extensions` 中的未知内容并原样保留（透传），避免因试验字段阻塞导入。
- 对于 `globalRules` 中未知的 ruleId，Host MUST 跳过执行但 SHOULD 产生可见告警，避免“配置写错静默无效”。
- 对于 Prompt Override：Bundle 内的 prompt 作为默认值；Host MAY 使用配置中心覆盖，但 SHOULD 记录覆盖来源（便于排查差异）。
