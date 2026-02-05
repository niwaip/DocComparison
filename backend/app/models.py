from enum import Enum
from typing import List, Optional, Any
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
