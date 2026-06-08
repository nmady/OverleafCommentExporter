/**
 * Canonical row schema shared between content extraction and popup export serializers.
 *
 * Each row represents one visible comment item in the Overleaf review panel.
 * Thread-level fields (highlightedText/context/charPos) are only populated on
 * the first row for a thread and intentionally left empty for subsequent replies.
 */
export interface CommentRow {
  /** Stable thread identifier parsed from Overleaf review panel controls. */
  threadId: string;
  /** Zero-based comment index within the thread as rendered in the panel. */
  replyIndex: number;
  /** Display name shown by Overleaf for the comment author. */
  author: string;
  /** Date text rendered by Overleaf for the comment. */
  date: string;
  /** Full visible comment body text. */
  comment: string;
  /** Best available resolved highlight snippet for the thread anchor comment. */
  highlightedText: string;
  /** Nearby editor context around charPos for the anchor comment. */
  context: string;
  /** Editor character offset when available; empty when no reliable position exists. */
  charPos: number | "";
}