import { CommentRow } from "./types";

type EditorLines = {
  lines: Array<[number, string]>;
  fullText: string;
};

type DocLike = {
  toString: () => string;
};

type SelectionLike = {
  from: number;
  to: number;
};

function hasNonEmptySelection(selection: SelectionLike | null): selection is SelectionLike {
  return !!selection && selection.to > selection.from;
}

function selectionsEqual(a: SelectionLike | null, b: SelectionLike | null): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.from === b.from && a.to === b.to;
}

function isSelectionRelevantToPos(selection: SelectionLike | null, dataPos: number): boolean {
  if (!hasNonEmptySelection(selection)) {
    return false;
  }
  if (dataPos < 0) {
    return true;
  }
  if (selection.from <= dataPos && dataPos <= selection.to) {
    return true;
  }
  return Math.abs(selection.from - dataPos) <= 3;
}

function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function getWordAtPos(fullText: string, pos: number): string {
  if (!fullText || pos < 0 || pos >= fullText.length) {
    return "";
  }

  let start = pos;
  let end = pos;
  while (start > 0 && /[^\s]/.test(fullText[start - 1])) {
    start -= 1;
  }
  while (end < fullText.length && /[^\s]/.test(fullText[end])) {
    end += 1;
  }

  return normalizeSpaces(fullText.slice(start, end));
}

function getClosestOccurrenceDistance(fullText: string, text: string, dataPos: number): number {
  if (dataPos < 0) {
    return 0;
  }

  let closestDistance = Number.POSITIVE_INFINITY;
  let fromIndex = 0;
  while (fromIndex < fullText.length) {
    const idx = fullText.indexOf(text, fromIndex);
    if (idx < 0) {
      break;
    }

    const end = idx + text.length;
    const distance = dataPos < idx ? idx - dataPos : (dataPos > end ? dataPos - end : 0);
    if (distance < closestDistance) {
      closestDistance = distance;
      if (closestDistance === 0) {
        break;
      }
    }

    fromIndex = idx + 1;
  }

  return closestDistance;
}

type ExtractCommentsRequest = {
  action?: string;
};

type ExtractCommentsResponse = {
  ok: boolean;
  rows?: CommentRow[];
  error?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

async function expandCollapsedComments(root: ParentNode = document): Promise<number> {
  let expanded = 0;

  // Overleaf can render nested "show more" controls after an initial expansion.
  for (let pass = 0; pass < 4; pass += 1) {
    const buttons = Array.from(root.querySelectorAll(".review-panel-expandable-links button"))
      .filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement)
      .filter((btn) => {
        const label = normalizeSpaces(btn.textContent ?? "").toLowerCase();
        return label.includes("show more") && !btn.disabled && isVisible(btn);
      });

    if (!buttons.length) {
      break;
    }

    for (const button of buttons) {
      button.scrollIntoView({ block: "nearest", inline: "nearest" });
      button.click();
      expanded += 1;
      await sleep(40);
    }

    await sleep(120);
  }

  return expanded;
}

function extractUser(entryEl: Element): string {
  const userDiv = entryEl.querySelector(".review-panel-entry-user");
  if (!userDiv) {
    return "";
  }

  let name = "";
  for (const node of Array.from(userDiv.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      name += node.textContent ?? "";
    }
  }
  const trimmed = name.trim();
  return trimmed || (userDiv.textContent ?? "").trim();
}

function extractThreadId(entryEl: Element): string {
  const btn = entryEl.querySelector('[id^="review-panel-comment-options-btn-"]') as HTMLElement | null;
  if (!btn?.id) {
    return "";
  }
  return btn.id.replace("review-panel-comment-options-btn-", "");
}

function buildLinesFromText(fullText: string): Array<[number, string]> {
  const normalized = fullText.replace(/\r\n?/g, "\n");
  const parts = normalized.split("\n");
  const lines: Array<[number, string]> = [];
  let offset = 0;

  for (let i = 0; i < parts.length; i += 1) {
    const text = parts[i];
    lines.push([offset, text]);
    offset += text.length;
    if (i < parts.length - 1) {
      offset += 1;
    }
  }
  
  console.log("buildLinesFromText: Built lines array", { totalLines: lines.length, sample: lines.slice(0, 3).map(([off, txt]) => ({ off, len: txt.length, txt: txt.substring(0, 40) })) });

  return lines;
}

function findDocLike(obj: unknown): DocLike | null {
  if (!obj || typeof obj !== "object") {
    return null;
  }

  const asAny = obj as Record<string, unknown>;
  const maybeDoc = asAny.state && typeof asAny.state === "object"
    ? (asAny.state as Record<string, unknown>).doc
    : null;

  if (maybeDoc && typeof maybeDoc === "object") {
    const docAny = maybeDoc as Record<string, unknown>;
    if (typeof docAny.toString === "function") {
      return docAny as unknown as DocLike;
    }
  }

  return null;
}

function getEditorTextFromCodeMirrorState(): string | null {
  const editorEl = document.querySelector(".cm-editor") as (HTMLElement & Record<string, unknown>) | null;
  const contentEl = document.querySelector(".cm-content") as (HTMLElement & Record<string, unknown>) | null;

  const candidates: unknown[] = [];
  if (editorEl) {
    candidates.push(
      editorEl,
      editorEl.cmView,
      (editorEl.cmView as Record<string, unknown> | undefined)?.view,
      editorEl.view
    );
  }
  if (contentEl) {
    candidates.push(
      contentEl,
      contentEl.cmView,
      (contentEl.cmView as Record<string, unknown> | undefined)?.view,
      contentEl.view
    );
  }

  for (const candidate of candidates) {
    const doc = findDocLike(candidate);
    if (doc) {
      return doc.toString();
    }
  }

  return null;
}

function getEditorSelectionFromCodeMirrorState(): SelectionLike | null {
  const editorEl = document.querySelector(".cm-editor") as (HTMLElement & Record<string, unknown>) | null;
  const contentEl = document.querySelector(".cm-content") as (HTMLElement & Record<string, unknown>) | null;

  const candidates: unknown[] = [];
  if (editorEl) {
    candidates.push(
      editorEl,
      editorEl.cmView,
      (editorEl.cmView as Record<string, unknown> | undefined)?.view,
      editorEl.view
    );
  }
  if (contentEl) {
    candidates.push(
      contentEl,
      contentEl.cmView,
      (contentEl.cmView as Record<string, unknown> | undefined)?.view,
      contentEl.view
    );
  }

  for (let candIdx = 0; candIdx < candidates.length; candIdx++) {
    const candidate = candidates[candIdx];
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const state = (candidate as Record<string, unknown>).state;
    if (!state || typeof state !== "object") {
      continue;
    }

    const selection = (state as Record<string, unknown>).selection;
    if (!selection || typeof selection !== "object") {
      continue;
    }

    const main = (selection as Record<string, unknown>).main;
    if (!main || typeof main !== "object") {
      console.log("getEditorSelectionFromCodeMirrorState: selection.main not found, checking selection directly", { candIdx, selectionKeys: Object.keys(selection) });
      // Some versions have selection as a range-like object directly
      const from = (selection as Record<string, unknown>).from;
      const to = (selection as Record<string, unknown>).to;
      if (typeof from === "number" && typeof to === "number") {
        console.log("getEditorSelectionFromCodeMirrorState: Found selection in selection object", { from, to });
        return { from, to };
      }
      continue;
    }

    const from = (main as Record<string, unknown>).from;
    const to = (main as Record<string, unknown>).to;
    if (typeof from === "number" && typeof to === "number") {
      console.log("getEditorSelectionFromCodeMirrorState: Found selection", { from, to });
      return { from, to };
    }
  }

  console.warn("getEditorSelectionFromCodeMirrorState: No selection found in any candidate");
  return null;
}

function buildEditorLinesFromDom(): EditorLines {
  const cmContent = document.querySelector(".cm-content");
  if (!cmContent) {
    return { lines: [], fullText: "" };
  }

  const parts: string[] = [];
  for (const child of Array.from(cmContent.children)) {
    if (!(child instanceof HTMLElement) || !child.classList.contains("cm-line")) {
      continue;
    }
    parts.push(child.innerText || child.textContent || "");
  }

  const fullText = parts.join("\n");
  return {
    lines: buildLinesFromText(fullText),
    fullText
  };
}

function buildEditorLines(): EditorLines {
  const fullTextFromState = getEditorTextFromCodeMirrorState();
  if (fullTextFromState != null) {
    console.log("buildEditorLines: Using CodeMirror state", { textLen: fullTextFromState.length, sample: fullTextFromState.substring(0, 100) });
    return {
      lines: buildLinesFromText(fullTextFromState),
      fullText: fullTextFromState.replace(/\r\n?/g, "\n")
    };
  }
  console.warn("buildEditorLines: Falling back to DOM");
  return buildEditorLinesFromDom();
}

function getFocusedHighlightText(fullText: string, dataPos: number): string {
  const selectors = [
    ".cm-content .ol-cm-change-focus .ol-cm-change",
    ".cm-content .ol-cm-change",
    ".cm-content .ol-cm-change-highlight",
    ".cm-content .ol-cm-highlight-fix"
  ];

  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    console.log("getFocusedHighlightText: Checked selector", { selector, foundNodes: nodes.length });
    for (const node of nodes) {
      const text = normalizeSpaces(node.textContent ?? "");
      if (!text || seen.has(text)) {
        continue;
      }
      seen.add(text);
      candidates.push(text);
    }
  }

  if (!candidates.length) {
    console.warn("getFocusedHighlightText: No highlight text found");
    return "";
  }

  if (dataPos < 0) {
    return candidates[0];
  }

  let bestText = "";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = getClosestOccurrenceDistance(fullText, candidate, dataPos);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestText = candidate;
    }
  }

  if (bestText) {
    console.log("getFocusedHighlightText: Selected nearest highlight", {
      dataPos,
      distance: bestDistance,
      text: bestText.substring(0, 120)
    });
  }

  return bestText;
}

function isEntryHighlighted(entry: Element): boolean {
  return entry.classList.contains("review-panel-entry-highlighted");
}

function isCurrentHighlightedEntry(entry: Element): boolean {
  const current = document.querySelector(".review-panel-entry-highlighted");
  return current === entry;
}

function getFocusedHighlightBlock(): string {
  const focusNodes = Array.from(document.querySelectorAll(".cm-content .ol-cm-change-focus .ol-cm-change"));
  if (!focusNodes.length) {
    return "";
  }

  const lines: string[] = [];
  const seen = new Set<string>();
  for (const node of focusNodes) {
    const text = normalizeSpaces(node.textContent ?? "");
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    lines.push(text);
  }

  return lines.join("\n").trim();
}

function getNumberAttr(el: Element, attr: string): number | null {
  const raw = el.getAttribute(attr);
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getFocusedChangeTokens(): string[] {
  const nodes = Array.from(document.querySelectorAll(".cm-content .ol-cm-change-focus .ol-cm-change-c"));
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const node of nodes) {
    const text = normalizeSpaces(node.textContent ?? "");
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    tokens.push(text);
  }

  return tokens;
}

function overlapScore(commentText: string, candidate: string): number {
  const commentWords = new Set(
    commentText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4)
  );
  if (!commentWords.size) {
    return 0;
  }

  const candidateWords = candidate
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);

  let score = 0;
  for (const w of candidateWords) {
    if (commentWords.has(w)) {
      score += 1;
    }
  }
  return score;
}

function pickFocusedTokenFallback(commentText: string, entry: Element, entryList: Element[]): string {
  const tokens = getFocusedChangeTokens();
  if (!tokens.length) {
    return "";
  }

  let best = "";
  let bestScore = -1;
  for (const token of tokens) {
    const score = overlapScore(commentText, token);
    if (score > bestScore) {
      bestScore = score;
      best = token;
    }
  }

  if (bestScore > 0) {
    return best;
  }

  const currentTop = getNumberAttr(entry, "data-top");
  const currentPos = getNumberAttr(entry, "data-pos");
  if (currentTop == null || currentPos == null) {
    return tokens[0];
  }

  const local = entryList
    .map((el) => ({
      el,
      top: getNumberAttr(el, "data-top"),
      pos: getNumberAttr(el, "data-pos")
    }))
    .filter((x): x is { el: Element; top: number; pos: number } => x.top != null && x.pos != null)
    .filter((x) => Math.abs(x.top - currentTop) <= 120)
    .sort((a, b) => (a.top - b.top) || (a.pos - b.pos));

  const index = local.findIndex((x) => x.el === entry);
  if (index < 0) {
    return tokens[0];
  }

  return tokens[Math.min(index, tokens.length - 1)];
}

async function focusReviewEntry(entry: Element): Promise<void> {
  const target =
    (entry.querySelector(".review-panel-entry-content") as HTMLElement | null)
    ?? (entry.querySelector(".review-panel-comment-body") as HTMLElement | null)
    ?? (entry.querySelector(".review-panel-entry-indicator") as HTMLElement | null)
    ?? (entry as HTMLElement);
  console.log("focusReviewEntry: Clicking entry", {
    hasContent: entry.querySelector(".review-panel-entry-content") != null,
    hasCommentBody: entry.querySelector(".review-panel-comment-body") != null,
    hasIndicator: entry.querySelector(".review-panel-entry-indicator") != null
  });

  target.scrollIntoView({ block: "nearest", inline: "nearest" });
  dispatchMouseEvent(target, "mouseenter");
  dispatchMouseEvent(target, "mouseover");
  dispatchMouseEvent(target, "mousemove");
  dispatchMouseEvent(target, "mousedown");
  dispatchMouseEvent(target, "mouseup");
  dispatchMouseEvent(target, "click");
  target.focus();
  await sleep(140);

  const selection = getEditorSelectionFromCodeMirrorState();
  console.log("focusReviewEntry: After click", {
    selection,
    highlighted: isCurrentHighlightedEntry(entry)
  });
}

function dispatchMouseEvent(target: HTMLElement, type: string): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
}

async function hoverReviewEntry(entry: Element): Promise<void> {
  const target =
    (entry.querySelector(".review-panel-entry-indicator") as HTMLElement | null)
    ?? (entry as HTMLElement);
  console.log("hoverReviewEntry: Hovering entry", { hasIndicator: entry.querySelector(".review-panel-entry-indicator") != null });

  dispatchMouseEvent(target, "mouseenter");
  dispatchMouseEvent(target, "mouseover");
  dispatchMouseEvent(target, "mousemove");
  await sleep(90);
}

async function waitForRelevantSelection(dataPos: number, previous: SelectionLike | null): Promise<SelectionLike | null> {
  let latest: SelectionLike | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    latest = getEditorSelectionFromCodeMirrorState();
    if (!hasNonEmptySelection(latest)) {
      await sleep(35);
      continue;
    }

    const changed = !selectionsEqual(latest, previous);
    const relevant = isSelectionRelevantToPos(latest, dataPos);
    if (changed || relevant) {
      return latest;
    }

    await sleep(35);
  }
  return latest;
}

async function activateReviewEntry(entry: Element, dataPos: number, previous: SelectionLike | null): Promise<SelectionLike | null> {
  let selection = await waitForRelevantSelection(dataPos, previous);
  if (isCurrentHighlightedEntry(entry)) {
    return selection;
  }

  // Overleaf can ignore a single click when entries are virtualized; retry activation.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await focusReviewEntry(entry);
    selection = await waitForRelevantSelection(dataPos, selection);
    if (isCurrentHighlightedEntry(entry)) {
      return selection;
    }
  }

  return selection;
}

function getContextAtPos(editor: EditorLines, pos: number): [string, string] {
  const { lines, fullText } = editor;
  if (!lines.length || !fullText.length || pos < 0) {
    console.warn("getContextAtPos: No editor lines or fullText", { linesCount: lines.length, fullTextLen: fullText.length, pos });
    return ["", ""];
  }

  const clampedPos = Math.max(0, Math.min(pos, Math.max(0, fullText.length - 1)));
  console.log("getContextAtPos: Processing pos", { originalPos: pos, clampedPos, fullTextLen: fullText.length });

  let highlighted = "";
  let anchorLineIndex = -1;
  // First pass: find non-empty line containing position
  for (let i = 0; i < lines.length; i += 1) {
    const [start, text] = lines[i];
    const end = start + text.length;
    if (text.length > 0 && start <= clampedPos && clampedPos <= end) {
      highlighted = text;
      anchorLineIndex = i;
      console.log("getContextAtPos: Found non-empty line containing position", { start, end, textLen: text.length, text: text.substring(0, 50) });
      break;
    }
  }
  
  // Second pass: if no non-empty line found, find any line containing position (including empty)
  if (!highlighted) {
    for (let i = 0; i < lines.length; i += 1) {
      const [start, text] = lines[i];
      const end = start + text.length;
      if (start <= clampedPos && clampedPos <= end) {
        highlighted = text;
        anchorLineIndex = i;
        console.log("getContextAtPos: Found line (possibly empty) containing position", { start, end, textLen: text.length });
        break;
      }
    }
  }
  
  // Fallback: find closest non-empty line before position
  if (!highlighted) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const [start, text] = lines[i];
      if (text.length > 0 && start <= clampedPos) {
        highlighted = text;
        anchorLineIndex = i;
        console.log("getContextAtPos: Using closest prior non-empty line", { start, textLen: text.length, text: text.substring(0, 50) });
        break;
      }
    }
  }
  
  if (!highlighted) {
    highlighted = lines[lines.length - 1][1];
    anchorLineIndex = lines.length - 1;
    console.warn("getContextAtPos: No suitable line found, using last line");
  }

  let startLine = 0;
  for (let i = anchorLineIndex; i >= 0; i -= 1) {
    if (lines[i][1].trim().length === 0) {
      startLine = i + 1;
      break;
    }
  }

  let endLine = lines.length - 1;
  for (let i = anchorLineIndex; i < lines.length; i += 1) {
    if (lines[i][1].trim().length === 0) {
      endLine = i - 1;
      break;
    }
  }

  while (startLine <= endLine && lines[startLine][1].trim().length === 0) {
    startLine += 1;
  }
  while (endLine >= startLine && lines[endLine][1].trim().length === 0) {
    endLine -= 1;
  }

  const context = startLine <= endLine
    ? lines.slice(startLine, endLine + 1).map(([, text]) => text).join("\n").trim()
    : "";

  const ctxStart = startLine <= endLine ? lines[startLine][0] : -1;
  const ctxEnd = startLine <= endLine ? lines[endLine][0] + lines[endLine][1].length : -1;
  console.log("getContextAtPos: Context block from blank-line boundaries", {
    anchorLineIndex,
    startLine,
    endLine,
    ctxStart,
    ctxEnd,
    contextLen: context.length,
    context: context.substring(0, 100)
  });
  
  return [highlighted, context];
}

function sliceFromSelection(fullText: string, selection: SelectionLike | null): string {
  if (!selection || selection.to <= selection.from) {
    console.log("sliceFromSelection: Invalid selection", { selection, fullTextLen: fullText.length });
    return "";
  }

  const start = Math.max(0, Math.min(selection.from, fullText.length));
  const end = Math.max(start, Math.min(selection.to, fullText.length));
  const result = fullText.slice(start, end).trim();
  console.log("sliceFromSelection: Extracted text", { from: selection.from, to: selection.to, start, end, textLen: result.length, text: result.substring(0, 50) });
  return result;
}

async function extractComments(): Promise<CommentRow[]> {
  const rows: CommentRow[] = [];
  const expandedBeforeExtraction = await expandCollapsedComments(document);
  console.log("extractComments: Expanded collapsed comments before extraction", { expandedBeforeExtraction });
  const editor = buildEditorLines();
  console.log("extractComments: Editor lines built", { linesCount: editor.lines.length, fullTextLen: editor.fullText.length, fullText: editor.fullText.substring(0, 200) });

  const entries = document.querySelectorAll(".review-panel-entry-comment");
  const entryList = Array.from(entries);
  console.log("extractComments: Found entries", { count: entries.length });
  let previousSelection: SelectionLike | null = null;
  
  for (const entry of entryList) {
    const expandedInEntry = await expandCollapsedComments(entry);
    if (expandedInEntry > 0) {
      console.log("extractComments: Expanded collapsed comments in entry", { expandedInEntry });
    }

    const threadId = extractThreadId(entry);
    const dataPos = Number.parseInt(entry.getAttribute("data-pos") ?? "-1", 10);
    const rootCommentText = normalizeSpaces(entry.querySelector(".review-panel-comment-body")?.textContent ?? "");
    const selectionBefore = getEditorSelectionFromCodeMirrorState();

    await hoverReviewEntry(entry);
    let selection = await activateReviewEntry(entry, dataPos, previousSelection);
    let uiHighlight = getFocusedHighlightText(editor.fullText, dataPos);
    let focusedBlock = isCurrentHighlightedEntry(entry) || isEntryHighlighted(entry)
      ? getFocusedHighlightBlock()
      : "";
    let interactionMode: "hover" | "click" = "hover";

    const hoverSelectionHighlight = normalizeSpaces(sliceFromSelection(editor.fullText, selection));
    const hoverSelectionChanged = !selectionsEqual(selection, selectionBefore);
    let validSelectionHighlight =
      hasNonEmptySelection(selection) && hoverSelectionChanged && hoverSelectionHighlight
        ? hoverSelectionHighlight
        : "";
    let validUiHighlight = !validSelectionHighlight ? focusedBlock : "";
    let validFocusedTokenFallback = !validSelectionHighlight && !validUiHighlight
      ? pickFocusedTokenFallback(rootCommentText, entry, entryList)
      : "";

    if (!validSelectionHighlight && !validUiHighlight && !validFocusedTokenFallback) {
      selection = await activateReviewEntry(entry, dataPos, selection);
      uiHighlight = getFocusedHighlightText(editor.fullText, dataPos);
      focusedBlock = isCurrentHighlightedEntry(entry) || isEntryHighlighted(entry)
        ? getFocusedHighlightBlock()
        : "";
      interactionMode = "click";

      const clickSelectionHighlight = normalizeSpaces(sliceFromSelection(editor.fullText, selection));
      const clickSelectionChanged = !selectionsEqual(selection, selectionBefore);
      validSelectionHighlight =
        hasNonEmptySelection(selection) && clickSelectionChanged && clickSelectionHighlight
          ? clickSelectionHighlight
          : "";
      validUiHighlight = !validSelectionHighlight ? focusedBlock : "";
      validFocusedTokenFallback = !validSelectionHighlight && !validUiHighlight
        ? pickFocusedTokenFallback(rootCommentText, entry, entryList)
        : "";
    }

    previousSelection = selection;

    const activePos = isSelectionRelevantToPos(selection, dataPos)
      ? (selection?.from ?? dataPos)
      : dataPos;
    const [posBasedHighlight, context] = getContextAtPos(editor, activePos);
    const selectionHighlight = normalizeSpaces(sliceFromSelection(editor.fullText, selection));
    const wordAtPos = getWordAtPos(editor.fullText, activePos);

    const validPosHighlight = normalizeSpaces(wordAtPos || posBasedHighlight);
    
    console.log("extractComments: Entry analysis", {
      threadId,
      dataPos,
      interactionMode,
      selection: selection ? { from: selection.from, to: selection.to } : null,
      activePos,
      uiHighlight: uiHighlight.substring(0, 50),
      selectionHighlight: selectionHighlight.substring(0, 50),
      posBasedHighlight: posBasedHighlight.substring(0, 50),
      validSelectionHighlight: validSelectionHighlight.substring(0, 50),
      validUiHighlight: validUiHighlight.substring(0, 50),
      validFocusedTokenFallback: validFocusedTokenFallback.substring(0, 50),
      validPosHighlight: validPosHighlight.substring(0, 50)
    });
    
    const highlightedText = validSelectionHighlight || validUiHighlight || validFocusedTokenFallback || validPosHighlight;
    const highlightSource = validSelectionHighlight
      ? "selection"
      : (validUiHighlight ? "focusedBlock" : (validFocusedTokenFallback ? "focusedTokenFallback" : "positionFallback"));
    const debug = [
      `source=${highlightSource}`,
      `interaction=${interactionMode}`,
      `entryHighlighted=${isCurrentHighlightedEntry(entry) || isEntryHighlighted(entry)}`,
      `dataPos=${dataPos}`,
      `activePos=${activePos}`,
      `selectionBefore=${selectionBefore ? `${selectionBefore.from}-${selectionBefore.to}` : "none"}`,
      `selectionAfter=${selection ? `${selection.from}-${selection.to}` : "none"}`,
      `selectionChanged=${!selectionsEqual(selection, selectionBefore)}`,
      `selectionLen=${selectionHighlight.length}`,
      `focusedLen=${focusedBlock.length}`,
      `focusedTokenLen=${validFocusedTokenFallback.length}`,
      `uiLen=${normalizeSpaces(uiHighlight).length}`,
      `posLen=${validPosHighlight.length}`
    ].join(" | ");
    console.log("extractComments: Selected highlighted text", { selected: highlightedText.substring(0, 50) });

    const commentEls = entry.querySelectorAll(".review-panel-comment");
    let index = 0;
    for (const commentEl of Array.from(commentEls)) {
      const body = (commentEl.querySelector(".review-panel-comment-body")?.textContent ?? "").trim();
      if (!body) {
        continue;
      }

      rows.push({
        threadId,
        commentIndex: index,
        author: extractUser(commentEl),
        date: (commentEl.querySelector(".review-panel-entry-time")?.textContent ?? "").trim(),
        comment: body,
        highlightedText: index === 0 ? highlightedText : "",
        context: index === 0 ? context : "",
        charPos: index === 0 ? activePos : "",
        debug: index === 0 ? debug : ""
      });
      index += 1;
    }
  }

  return rows;
}

chrome.runtime.onMessage.addListener((
  message: ExtractCommentsRequest,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: ExtractCommentsResponse) => void
) => {
  if (message?.action !== "extract-comments") {
    return;
  }

  extractComments()
    .then((rows) => {
      sendResponse({ ok: true, rows });
    })
    .catch((error) => {
      sendResponse({ ok: false, error: String(error) });
    });

  return true;
});
