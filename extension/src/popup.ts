import { CommentRow } from "./types";

type CommentRowWire = CommentRow & {
  debug?: string;
};

const COLUMNS: Array<[keyof CommentRow, string]> = [
  ["threadId", "Thread ID"],
  ["commentIndex", "Reply #"],
  ["author", "Author"],
  ["date", "Date"],
  ["comment", "Comment"],
  ["highlightedText", "Highlighted Text"],
  ["context", "Context"],
  ["charPos", "Char Position"],
  ["dbgSource", "Dbg Source"],
  ["dbgConfidence", "Dbg Confidence"],
  ["dbgInteraction", "Dbg Interaction"],
  ["dbgUiSource", "Dbg UI Source"],
  ["dbgUiLen", "Dbg UI Len"],
  ["dbgDataPos", "Dbg Data Pos"],
  ["dbgEntryHighlighted", "Dbg Entry Highlighted"],
  ["dbgLocalAnchorFound", "Dbg Local Anchor Found"],
  ["dbgLocalDataPos", "Dbg Local Data Pos"],
  ["dbgLocalContextStart", "Dbg Local Context Start"],
  ["dbgLocalContextEnd", "Dbg Local Context End"],
  ["dbgScrollMethod", "Dbg Scroll Method"],
  ["dbgScrollTargetLine", "Dbg Scroll Target Line"],
  ["dbgScrollTargetVisible", "Dbg Scroll Target Visible"],
  ["dbgUiCandidates", "Dbg UI Candidates"]
];

function csvEscape(value: string | number | boolean): string {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: CommentRow[]): string {
  const header = COLUMNS.map(([, label]) => csvEscape(label)).join(",");
  const body = rows.map((row) => COLUMNS.map(([key]) => csvEscape(row[key] as string | number | boolean)).join(","));
  return [header, ...body].join("\r\n");
}

function parseLegacyDebug(debug: string): Partial<CommentRow> {
  const parsed = new Map<string, string>();
  for (const chunk of debug.split(" | ")) {
    const eq = chunk.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    parsed.set(chunk.slice(0, eq), chunk.slice(eq + 1));
  }

  const readNumber = (key: string): number | "" => {
    const value = parsed.get(key);
    if (value == null || value === "") {
      return "";
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : "";
  };

  const readBoolean = (key: string): boolean | "" => {
    const value = parsed.get(key);
    if (value == null || value === "") {
      return "";
    }
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    return "";
  };

  return {
    dbgSource: parsed.get("source") ?? "",
    dbgConfidence: parsed.get("confidence") ?? "",
    dbgInteraction: parsed.get("interaction") ?? "",
    dbgUiSource: parsed.get("uiSource") ?? "",
    dbgUiLen: readNumber("uiLen"),
    dbgDataPos: readNumber("dataPos"),
    dbgEntryHighlighted: readBoolean("entryHighlighted"),
    dbgLocalAnchorFound: "",
    dbgLocalDataPos: "",
    dbgLocalContextStart: "",
    dbgLocalContextEnd: "",
    dbgScrollMethod: parsed.get("scrollMethod") ?? "",
    dbgScrollTargetLine: readNumber("scrollTargetLine"),
    dbgScrollTargetVisible: readBoolean("scrollTargetVisible"),
    dbgUiCandidates: parsed.get("uiCandidates") ?? ""
  };
}

function normalizeRows(rows: CommentRowWire[]): CommentRow[] {
  return rows.map((row) => {
    if (row.dbgSource || row.dbgConfidence || row.dbgUiSource || row.dbgUiCandidates) {
      return row;
    }

    if (!row.debug) {
      return row;
    }

    return {
      ...row,
      ...parseLegacyDebug(row.debug)
    };
  });
}

function downloadFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setStatus(message: string): void {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = message;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("export-btn") as HTMLButtonElement | null;
  if (!btn) {
    return;
  }

  btn.addEventListener("click", () => {
    btn.disabled = true;
    setStatus("Extracting comments...");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId == null) {
        setStatus("No active tab found.");
        btn.disabled = false;
        return;
      }

      chrome.tabs.sendMessage(tabId, { action: "extract-comments" }, async (response: { ok: boolean; rows?: CommentRowWire[]; editorFullText?: string; editorTextSource?: string; editorTextLen?: number; errors?: string[]; error?: string }) => {
        btn.disabled = false;

        if (chrome.runtime.lastError) {
          setStatus("Cannot access this tab. Open an Overleaf project tab first.");
          return;
        }

        if (!response?.ok) {
          setStatus(response?.error || "Extraction failed.");
          return;
        }

        const rows = normalizeRows(response.rows ?? []);
        const dateStamp = new Date().toISOString().slice(0, 10);
        const errors = response.errors ?? [];

        if (rows.length === 0) {
          setStatus("No comments found to export.");
          return;
        }

        const csvBlob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
        downloadFile(`overleaf-comments-${dateStamp}.csv`, csvBlob);

        const extra = errors.length > 0
          ? ` (${errors.length} extraction issue${errors.length === 1 ? "" : "s"} logged in debug columns)`
          : "";
        setStatus(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}${extra}`);
      });
    });
  });
});
