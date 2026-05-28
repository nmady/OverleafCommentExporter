import { CommentRow } from "./types";
import ExcelJS from "exceljs";

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

function buildContextCellValue(
  context: string,
  highlightedText: string
): ExcelJS.CellRichTextValue | string {
  if (!highlightedText || !context) {
    return context;
  }
  const idx = context.indexOf(highlightedText);
  if (idx === -1) {
    return context;
  }
  const before = context.slice(0, idx);
  const after = context.slice(idx + highlightedText.length);
  const runs: ExcelJS.RichText[] = [];
  if (before) {
    runs.push({ text: before });
  }
  runs.push({ font: { bold: true, underline: true }, text: highlightedText });
  if (after) {
    runs.push({ text: after });
  }
  return { richText: runs };
}

async function toXlsx(rows: CommentRow[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Comments");

  const wrapAlignment = { wrapText: true, vertical: "top" as const };

  worksheet.columns = [
    { header: "Thread ID",        key: "threadId",        width: 18 },
    { header: "Reply #",          key: "commentIndex",    width: 8 },
    { header: "Author",           key: "author",          width: 20 },
    { header: "Date",             key: "date",            width: 22 },
    { header: "Comment",          key: "comment",         width: 45, style: { alignment: wrapAlignment } },
    { header: "Highlighted Text", key: "highlightedText", width: 32, style: { alignment: wrapAlignment } },
    { header: "Context",          key: "context",         width: 48, style: { alignment: wrapAlignment } },
    { header: "Char Position",    key: "charPos",         width: 14 },
  ];

  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of rows) {
    const wsRow = worksheet.addRow({
      threadId:        row.threadId,
      commentIndex:    row.commentIndex,
      author:          row.author,
      date:            row.date,
      comment:         row.comment,
      highlightedText: row.highlightedText,
      charPos:         row.charPos,
    });
    const contextCell = wsRow.getCell("context");
    contextCell.value = buildContextCellValue(row.context, row.highlightedText);
    contextCell.alignment = wrapAlignment;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

type ExtractResponse = {
  ok: boolean;
  rows?: CommentRowWire[];
  editorFullText?: string;
  editorTextSource?: string;
  editorTextLen?: number;
  errors?: string[];
  error?: string;
};

function fetchCommentRows(
  tabId: number
): Promise<{ rows: CommentRow[]; errors: string[] } | { error: string }> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: "extract-comments" }, (response: ExtractResponse) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message ?? "Cannot access this tab. Open an Overleaf project tab first." });
        return;
      }
      if (!response?.ok) {
        resolve({ error: response?.error ?? "Extraction failed." });
        return;
      }
      resolve({
        rows: normalizeRows(response.rows ?? []),
        errors: response.errors ?? [],
      });
    });
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
  const csvBtn  = document.getElementById("export-btn")      as HTMLButtonElement | null;
  const xlsxBtn = document.getElementById("export-xlsx-btn") as HTMLButtonElement | null;
  if (!csvBtn || !xlsxBtn) {
    return;
  }

  function setBothDisabled(disabled: boolean): void {
    csvBtn!.disabled  = disabled;
    xlsxBtn!.disabled = disabled;
  }

  function getTabId(): Promise<number | null> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]?.id ?? null);
      });
    });
  }

  csvBtn.addEventListener("click", async () => {
    setBothDisabled(true);
    setStatus("Extracting comments...");

    const tabId = await getTabId();
    if (tabId == null) {
      setStatus("No active tab found.");
      setBothDisabled(false);
      return;
    }

    const result = await fetchCommentRows(tabId);
    setBothDisabled(false);

    if ("error" in result) {
      setStatus(result.error);
      return;
    }

    const { rows, errors } = result;
    if (rows.length === 0) {
      setStatus("No comments found to export.");
      return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const csvBlob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    downloadFile(`overleaf-comments-${dateStamp}.csv`, csvBlob);

    const extra = errors.length > 0
      ? ` (${errors.length} extraction issue${errors.length === 1 ? "" : "s"} logged in debug columns)`
      : "";
    setStatus(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}${extra}`);
  });

  xlsxBtn.addEventListener("click", async () => {
    setBothDisabled(true);
    setStatus("Extracting comments...");

    const tabId = await getTabId();
    if (tabId == null) {
      setStatus("No active tab found.");
      setBothDisabled(false);
      return;
    }

    const result = await fetchCommentRows(tabId);
    if ("error" in result) {
      setBothDisabled(false);
      setStatus(result.error);
      return;
    }

    const { rows, errors } = result;
    if (rows.length === 0) {
      setBothDisabled(false);
      setStatus("No comments found to export.");
      return;
    }

    setStatus("Building XLSX...");
    let xlsxBlob: Blob;
    try {
      xlsxBlob = await toXlsx(rows);
    } catch {
      setBothDisabled(false);
      setStatus("XLSX generation failed.");
      return;
    }

    setBothDisabled(false);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadFile(`overleaf-comments-${dateStamp}.xlsx`, xlsxBlob);

    const extra = errors.length > 0
      ? ` (${errors.length} extraction issue${errors.length === 1 ? "" : "s"})`
      : "";
    setStatus(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}${extra}`);
  });
});
