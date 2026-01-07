export type BlockKind = "heading" | "paragraph" | "list_item" | "table";

export type Block = {
  blockId: string;
  kind: BlockKind;
  structurePath: string;
  stableKey: string;
  text: string;
  htmlFragment: string;
  meta: {
    headingLevel?: number;
  };
};

export type RowKind = "matched" | "modified" | "inserted" | "deleted";

export type AlignmentRow = {
  rowId: string;
  kind: RowKind;
  leftBlockId: string | null;
  rightBlockId: string | null;
  meta?: {
    sectionNumberChanged?: boolean;
    beforeSectionLabel?: string | null;
    afterSectionLabel?: string | null;
  };
  diff?: {
    diffHtmlFragment: string;
  };
  ai?: {
    status: "none" | "pending" | "done" | "failed";
  };
};

export type RiskItemV1 = {
  schemaVersion: "1";
  blockId: string;
  clauseType: string;
  level: "high" | "medium" | "low";
  tags: string[];
  confidence: number;
  summary: string;
  analysis: string;
  recommendations: string[];
  questionsForReview: string[];
  citations: {
    beforeText: string | null;
    afterText: string | null;
    anchors: {
      blockSelector: string;
      insIds?: string[];
      delIds?: string[];
    };
  };
};
