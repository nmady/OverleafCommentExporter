export interface CommentRow {
  threadId: string;
  commentIndex: number;
  author: string;
  date: string;
  comment: string;
  highlightedText: string;
  context: string;
  charPos: number | "";
}