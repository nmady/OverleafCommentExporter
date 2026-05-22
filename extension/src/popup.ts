import { CommentRow } from "./types";

const COLUMNS: Array<[keyof CommentRow, string]> = [
  ["threadId", "Thread ID"],
  ["commentIndex", "Reply #"],
  ["author", "Author"],
  ["date", "Date"],
  ["comment", "Comment"],
  ["highlightedText", "Highlighted Text"],
  ["context", "Context"],
  ["charPos", "Char Position"],
  ["debug", "Debug"]
];

function csvEscape(value: string | number): string {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: CommentRow[]): string {
  const header = COLUMNS.map(([, label]) => csvEscape(label)).join(",");
  const body = rows.map((row) => COLUMNS.map(([key]) => csvEscape(row[key] as string | number)).join(","));
  return [header, ...body].join("\r\n");
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

      chrome.tabs.sendMessage(tabId, { action: "extract-comments" }, async (response: { ok: boolean; rows?: CommentRow[]; editorFullText?: string; editorTextSource?: string; editorTextLen?: number; errors?: string[]; error?: string }) => {
        btn.disabled = false;

        if (chrome.runtime.lastError) {
          setStatus("Cannot access this tab. Open an Overleaf project tab first.");
          return;
        }

        if (!response?.ok) {
          setStatus(response?.error || "Extraction failed.");
          return;
        }

        const rows = response.rows ?? [];
        const dateStamp = new Date().toISOString().slice(0, 10);
        const errors = response.errors ?? [];

        if (rows.length === 0) {
          setStatus("No comments found to export.");
          return;
        }

        const csvBlob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
        downloadFile(`overleaf-comments-${dateStamp}.csv`, csvBlob);

        const extra = errors.length > 0
          ? ` (${errors.length} extraction issue${errors.length === 1 ? "" : "s"} logged in Debug column)`
          : "";
        setStatus(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}${extra}`);
      });
    });
  });
});
