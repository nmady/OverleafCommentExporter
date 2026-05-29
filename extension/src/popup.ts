import { CommentRow } from "./types";
import { strToU8, zipSync } from "fflate";

const COLUMNS: Array<[keyof CommentRow, string]> = [
  ["threadId", "Thread ID"],
  ["commentIndex", "Reply #"],
  ["author", "Author"],
  ["date", "Date"],
  ["comment", "Comment"],
  ["highlightedText", "Highlighted Text"],
  ["context", "Context"],
  ["charPos", "Char Position"]
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

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toColumnName(index: number): string {
  let value = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    value = String.fromCharCode(65 + rem) + value;
    n = Math.floor((n - 1) / 26);
  }
  return value;
}

function textNode(value: string): string {
  const escaped = xmlEscape(value);
  if (/^\s|\s$|\n|\t|  /.test(value)) {
    return `<t xml:space="preserve">${escaped}</t>`;
  }
  return `<t>${escaped}</t>`;
}

function buildContextRuns(context: string, highlightedText: string): Array<{ text: string; emphasize: boolean }> {
  if (!context || !highlightedText) {
    return [{ text: context, emphasize: false }];
  }

  const idx = context.indexOf(highlightedText);
  if (idx === -1) {
    return [{ text: context, emphasize: false }];
  }

  const before = context.slice(0, idx);
  const after = context.slice(idx + highlightedText.length);
  const runs: Array<{ text: string; emphasize: boolean }> = [];
  if (before) {
    runs.push({ text: before, emphasize: false });
  }
  runs.push({ text: highlightedText, emphasize: true });
  if (after) {
    runs.push({ text: after, emphasize: false });
  }
  return runs;
}

function inlineStringCell(ref: string, value: string, styleIndex?: number): string {
  const styleAttr = styleIndex != null ? ` s="${styleIndex}"` : "";
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is>${textNode(value)}</is></c>`;
}

function richTextCell(ref: string, runs: Array<{ text: string; emphasize: boolean }>, styleIndex?: number): string {
  const styleAttr = styleIndex != null ? ` s="${styleIndex}"` : "";
  const runXml = runs
    .filter((run) => run.text.length > 0)
    .map((run) => {
      const style = run.emphasize ? "<rPr><b/><u/></rPr>" : "";
      return `<r>${style}${textNode(run.text)}</r>`;
    })
    .join("");
  const normalizedRuns = runXml || `<r>${textNode("")}</r>`;
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is>${normalizedRuns}</is></c>`;
}

function numberCell(ref: string, value: number, styleIndex?: number): string {
  const styleAttr = styleIndex != null ? ` s="${styleIndex}"` : "";
  return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
}

async function toXlsx(rows: CommentRow[]): Promise<Blob> {
  const headers = [
    "Thread ID",
    "Reply #",
    "Author",
    "Date",
    "Comment",
    "Highlighted Text",
    "Context",
    "Char Position"
  ];
  const widths = [18, 8, 20, 22, 45, 32, 48, 14];

  const rowXml: string[] = [];

  rowXml.push(
    `<row r="1">${headers
      .map((header, idx) => inlineStringCell(`${toColumnName(idx + 1)}1`, header, 1))
      .join("")}</row>`
  );

  rows.forEach((row, index) => {
    const r = index + 2;
    const cells: string[] = [];
    cells.push(inlineStringCell(`A${r}`, row.threadId));
    cells.push(numberCell(`B${r}`, row.commentIndex));
    cells.push(inlineStringCell(`C${r}`, row.author));
    cells.push(inlineStringCell(`D${r}`, row.date));
    cells.push(inlineStringCell(`E${r}`, row.comment, 2));
    cells.push(inlineStringCell(`F${r}`, row.highlightedText, 2));
    cells.push(richTextCell(`G${r}`, buildContextRuns(row.context, row.highlightedText), 2));
    if (typeof row.charPos === "number") {
      cells.push(numberCell(`H${r}`, row.charPos));
    } else {
      cells.push(inlineStringCell(`H${r}`, ""));
    }
    rowXml.push(`<row r="${r}">${cells.join("")}</row>`);
  });

  const colsXml = widths
    .map((width, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${width}" customWidth="1"/>`)
    .join("");

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>${colsXml}</cols>
  <sheetData>${rowXml.join("")}</sheetData>
</worksheet>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Comments" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const zipData = zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypesXml),
      "_rels/.rels": strToU8(rootRelsXml),
      "xl/workbook.xml": strToU8(workbookXml),
      "xl/_rels/workbook.xml.rels": strToU8(workbookRelsXml),
      "xl/styles.xml": strToU8(stylesXml),
      "xl/worksheets/sheet1.xml": strToU8(sheetXml)
    },
    { level: 0 }
  );

  return new Blob([zipData], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

type ExtractResponse = {
  ok: boolean;
  rows?: CommentRow[];
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
        rows: response.rows ?? [],
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
