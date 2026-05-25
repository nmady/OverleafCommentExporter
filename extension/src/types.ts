export interface CommentRow {
  threadId: string;
  commentIndex: number;
  author: string;
  date: string;
  comment: string;
  highlightedText: string;
  context: string;
  charPos: number | "";
  dbgSource: string;
  dbgConfidence: string;
  dbgInteraction: string;
  dbgUiSource: string;
  dbgUiLen: number | "";
  dbgDataPos: number | "";
  dbgEntryHighlighted: boolean | "";
  dbgLocalAnchorFound: boolean | "";
  dbgLocalDataPos: number | "";
  dbgLocalContextStart: number | "";
  dbgLocalContextEnd: number | "";
  dbgScrollMethod: string;
  dbgScrollTargetLine: number | "";
  dbgScrollTargetVisible: boolean | "";
  dbgUiCandidates: string;
}