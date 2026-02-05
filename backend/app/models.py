from enum import Enum
from typing import List, Optional, Any, Dict
from pydantic import BaseModel

class BlockKind(str, Enum):
    HEADING = "heading"
    PARAGRAPH = "paragraph"
    LIST_ITEM = "list_item"
    TABLE = "table"

class BlockMeta(BaseModel):
    headingLevel: Optional[int] = None
    pageNumber: Optional[int] = None

class Block(BaseModel):
    blockId: str
    kind: BlockKind
    structurePath: str
    stableKey: str
    text: str
    htmlFragment: str
    meta: BlockMeta = BlockMeta()

class RowKind(str, Enum):
    MATCHED = "matched"
    INSERTED = "inserted"
    DELETED = "deleted"
    CHANGED = "changed"

class AlignmentRow(BaseModel):
    rowId: str
    kind: RowKind
    leftBlockId: Optional[str] = None
    rightBlockId: Optional[str] = None
    diffHtml: Optional[str] = None  # Deprecated
    leftDiffHtml: Optional[str] = None
    rightDiffHtml: Optional[str] = None

class CheckSeverity(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class CheckStatus(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    WARN = "warn"
    MANUAL = "manual"
    ERROR = "error"
    SKIPPED = "skipped"

class AnchorType(str, Enum):
    STABLE_KEY = "stableKey"
    TEXT_REGEX = "textRegex"
    TABLE_CONTAINS = "tableContains"

class PointAnchor(BaseModel):
    type: AnchorType
    value: str

class RuleType(str, Enum):
    REQUIRED_AFTER_COLON = "requiredAfterColon"
    DATE_MONTH = "dateMonth"
    COMPANY_SUFFIX = "companySuffix"
    OPTION_SELECTED = "optionSelected"
    NUMBER_MAX = "numberMax"
    BANK_ACCOUNT_IN_LIST = "bankAccountInList"
    TABLE_SALES_ITEMS = "tableSalesItems"
    FILL_OR_STRIKE = "fillOrStrike"

class CheckRule(BaseModel):
    type: RuleType
    params: Dict[str, Any] = {}

class AiPolicy(str, Enum):
    NEVER = "never"
    OPTIONAL = "optional"
    WHEN_FAIL = "whenFail"
    ALWAYS = "always"

class PointAi(BaseModel):
    policy: AiPolicy = AiPolicy.OPTIONAL
    prompt: Optional[str] = None

class CheckPoint(BaseModel):
    pointId: str
    title: str
    severity: CheckSeverity = CheckSeverity.MEDIUM
    anchor: PointAnchor
    rules: List[CheckRule] = []
    ai: Optional[PointAi] = None

class Ruleset(BaseModel):
    templateId: str
    name: str
    version: str
    referenceData: Dict[str, Any] = {}
    points: List[CheckPoint]

class CheckEvidence(BaseModel):
    rightBlockId: Optional[str] = None
    excerpt: Optional[str] = None

class CheckAiResult(BaseModel):
    status: Optional[CheckStatus] = None
    summary: Optional[str] = None
    confidence: Optional[float] = None
    raw: Optional[str] = None

class CheckResultItem(BaseModel):
    pointId: str
    title: str
    severity: CheckSeverity
    status: CheckStatus
    message: str
    evidence: CheckEvidence = CheckEvidence()
    ai: Optional[CheckAiResult] = None

class CheckRunRequest(BaseModel):
    templateId: str
    rightBlocks: List[Block]
    aiEnabled: bool = False

class CheckRunResponse(BaseModel):
    runId: str
    templateId: str
    templateVersion: str
    summary: Dict[str, Any]
    items: List[CheckResultItem]
