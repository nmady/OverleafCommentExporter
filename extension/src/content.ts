import { CommentRow } from "./types";

type EditorLines = {
  lines: Array<[number, string]>;
  fullText: string;
  source: "codemirror-state" | "dom-scroll-harvest" | "dom-visible-lines";
  lineCoverage: number;
  changeCommentCandidates: HighlightCandidate[];
};

type DocLike = {
  toString: () => string;
};

type DocLineLike = {
  number: number;
};

type EditorStateLike = {
  doc: DocLike & {
    lineAt?: (pos: number) => DocLineLike;
  };
};

type EditorViewLike = {
  state: EditorStateLike;
  dispatch: (spec: unknown) => void;
  focus?: () => void;
};

type ScrollCheck = {
  method: string;
  targetLine: number;
  visibleStart: number;
  visibleEnd: number;
  targetVisible: boolean;
};

type UiHighlightDetails = {
  text: string;
  source: string;
  candidateSummary: string;
  focusCommentCount: number;
  focusAnyCount: number;
  highlightCommentCount: number;
  highlightAnyCount: number;
  changeCommentCount: number;
  changeAnyCount: number;
};

type HighlightCandidate = {
  text: string;
  fragments: string[];
};

type ExactCandidateMatch = {
  text: string;
  fragmentCount: number;
  spanLength: number;
  distance: number;
};

type NearCandidateMatch = {
  text: string;
  fragmentCount: number;
  spanLength: number;
  distance: number;
};

type NearBucketMatch = NearCandidateMatch & {
  source: string;
};

type HighlightConfidence = "high" | "medium" | "low" | "none";

type HighlightResolution = {
  text: string;
  source: string;
  confidence: HighlightConfidence;
};

function normalizeSpaces(text: string): string {
  return text;
}

function hasAnyText(text: string): boolean {
  return text.length > 0;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWordBoundaryMatch(text: string, token: string): boolean {
  const cleanedText = text.toLowerCase();
  const cleanedToken = token.toLowerCase();
  if (!cleanedText || !cleanedToken) {
    return false;
  }

  // For very short or punctuation-heavy tokens, strict equality is safer than fuzzy matching.
  if (cleanedToken.length < 2 || !/[a-z0-9]/i.test(cleanedToken)) {
    return cleanedText === cleanedToken;
  }

  const regex = new RegExp(`\\b${escapeRegExp(cleanedToken)}\\b`, "i");
  return regex.test(cleanedText);
}

type ExtractCommentsRequest = {
  action?: string;
};

type ExtractCommentsResponse = {
  ok: boolean;
  rows?: CommentRow[];
  editorFullText?: string;
  editorTextSource?: string;
  editorTextLen?: number;
  errors?: string[];
  error?: string;
};

type ExtractCommentsResult = {
  rows: CommentRow[];
  editorFullText: string;
  editorTextSource: string;
  editorTextLen: number;
  errors: string[];
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

function getEntryDataPos(entryEl: Element): number {
  const direct = entryEl.getAttribute("data-pos");
  const directNum = direct == null ? NaN : Number.parseInt(direct, 10);
  if (Number.isFinite(directNum)) {
    return directNum;
  }

  const nearest = entryEl.closest(".review-panel-entry[data-pos]") as HTMLElement | null;
  const nearestRaw = nearest?.getAttribute("data-pos");
  const nearestNum = nearestRaw == null ? NaN : Number.parseInt(nearestRaw, 10);
  if (Number.isFinite(nearestNum)) {
    return nearestNum;
  }

  return -1;
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

function getDocFromPath(root: unknown, path: string[]): DocLike | null {
  if (!root || typeof root !== "object") {
    return null;
  }

  let current: unknown = root;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }

  if (current && typeof current === "object") {
    const asObj = current as Record<string, unknown>;
    if (typeof asObj.toString === "function") {
      return asObj as unknown as DocLike;
    }
  }

  return null;
}

function findDocLikeWithKnownPaths(obj: unknown): DocLike | null {
  const direct = findDocLike(obj);
  if (direct) {
    return direct;
  }

  const paths: string[][] = [
    ["doc"],
    ["state", "doc"],
    ["view", "state", "doc"],
    ["view", "view", "state", "doc"],
    ["cmView", "state", "doc"],
    ["cmView", "view", "state", "doc"],
    ["cmView", "view", "view", "state", "doc"],
    ["rootView", "state", "doc"],
    ["rootView", "view", "state", "doc"],
    ["editorView", "state", "doc"],
    ["_view", "state", "doc"]
  ];

  for (const path of paths) {
    const doc = getDocFromPath(obj, path);
    if (doc) {
      return doc;
    }
  }

  return null;
}

function findEditorViewLike(obj: unknown): EditorViewLike | null {
  if (!obj || typeof obj !== "object") {
    return null;
  }

  const paths: string[][] = [
    [],
    ["view"],
    ["cmView"],
    ["cmView", "view"],
    ["cmView", "view", "view"],
    ["editorView"],
    ["rootView"],
    ["_view"]
  ];

  for (const path of paths) {
    let current: unknown = obj;
    for (const key of path) {
      if (!current || typeof current !== "object") {
        current = null;
        break;
      }
      current = (current as Record<string, unknown>)[key];
    }

    if (!current || typeof current !== "object") {
      continue;
    }

    const maybeView = current as Record<string, unknown>;
    const state = maybeView.state as Record<string, unknown> | undefined;
    const doc = state?.doc as Record<string, unknown> | undefined;
    if (typeof maybeView.dispatch === "function" && doc && typeof doc.toString === "function") {
      return current as EditorViewLike;
    }
  }

  return null;
}

function getEditorViewLike(): EditorViewLike | null {
  const editorEl = document.querySelector(".cm-editor") as (HTMLElement & Record<string, unknown>) | null;
  const contentEl = document.querySelector(".cm-content") as (HTMLElement & Record<string, unknown>) | null;

  const candidates: unknown[] = [];
  if (editorEl) {
    candidates.push(editorEl, editorEl.cmView, editorEl.view, editorEl.editorView);
  }
  if (contentEl) {
    candidates.push(contentEl, contentEl.cmView, contentEl.view, contentEl.editorView);
  }

  for (const candidate of candidates) {
    const view = findEditorViewLike(candidate);
    if (view) {
      return view;
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
    const doc = findDocLikeWithKnownPaths(candidate);
    if (doc) {
      return doc.toString();
    }
  }

  return null;
}

function buildEditorLinesFromDom(): EditorLines {
  const cmContent = document.querySelector(".cm-content");
  if (!cmContent) {
    return {
      lines: [],
      fullText: "",
      source: "dom-visible-lines",
      lineCoverage: 0,
      changeCommentCandidates: []
    };
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
    fullText,
    source: "dom-visible-lines",
    lineCoverage: 0,
    changeCommentCandidates: getUniqueCandidatesForSelector(".cm-content .ol-cm-change-c")
  };
}

function collectCandidatesForSelector(
  root: ParentNode,
  selector: string,
  acc: Map<string, HighlightCandidate>
): void {
  const rawNodes = Array.from(root.querySelectorAll(selector));
  const nodes = rawNodes.filter((node) => {
    const parentMatch = (node.parentElement?.closest(selector) as Element | null);
    return parentMatch == null || parentMatch === node;
  });

  for (const node of nodes) {
    const text = node.textContent ?? "";
    if (!hasAnyText(text) || acc.has(text)) {
      continue;
    }
    const fragments = getTextFragments(node as Element);
    acc.set(text, {
      text,
      fragments: fragments.length ? fragments : [text]
    });
  }
}

function parseLineNumber(raw: string): number | null {
  const m = raw.trim().match(/^\d+$/);
  if (!m) {
    return null;
  }
  const n = Number.parseInt(m[0], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function captureVisibleLinesWithNumbers(scroller: HTMLElement, acc: Map<number, string>): void {
  const lineEls = Array.from(scroller.querySelectorAll(".cm-content .cm-line"))
    .filter((el): el is HTMLElement => el instanceof HTMLElement);
  const gutterEls = Array.from(scroller.querySelectorAll(".cm-lineNumbers .cm-gutterElement"))
    .filter((el): el is HTMLElement => el instanceof HTMLElement);

  const numberedGutters = gutterEls
    .map((el) => ({
      top: el.getBoundingClientRect().top,
      lineNo: parseLineNumber(el.textContent ?? "")
    }))
    .filter((x): x is { top: number; lineNo: number } => x.lineNo != null)
    .sort((a, b) => a.top - b.top);

  if (!numberedGutters.length) {
    return;
  }

  for (const lineEl of lineEls) {
    const top = lineEl.getBoundingClientRect().top;
    let best: { top: number; lineNo: number } | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const g of numberedGutters) {
      const dist = Math.abs(g.top - top);
      if (dist < bestDist) {
        bestDist = dist;
        best = g;
      }
      if (g.top > top && dist > bestDist) {
        break;
      }
    }

    if (!best || bestDist > 16) {
      continue;
    }

    const text = lineEl.textContent ?? "";
    const prev = acc.get(best.lineNo);
    // Keep the longest seen line for each line number to avoid transient truncation.
    if (!prev || text.length > prev.length) {
      acc.set(best.lineNo, text);
    }
  }
}

async function buildEditorLinesByScrollingDom(): Promise<EditorLines> {
  const scroller = document.querySelector(".cm-editor .cm-scroller") as HTMLElement | null;
  if (!scroller) {
    return buildEditorLinesFromDom();
  }

  const originalTop = scroller.scrollTop;
  const acc = new Map<number, string>();
  const changeCommentCandidates = new Map<string, HighlightCandidate>();
  const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const step = Math.max(60, Math.floor(scroller.clientHeight * 0.8));

  scroller.scrollTop = 0;
  await sleep(30);

  let guard = 0;
  while (guard < 3000) {
    captureVisibleLinesWithNumbers(scroller, acc);
    collectCandidatesForSelector(scroller, ".cm-content .ol-cm-change-c", changeCommentCandidates);

    const current = scroller.scrollTop;
    if (current >= maxTop - 1) {
      break;
    }

    const next = Math.min(maxTop, current + step);
    if (next <= current) {
      break;
    }

    scroller.scrollTop = next;
    await sleep(22);
    guard += 1;
  }

  scroller.scrollTop = maxTop;
  await sleep(25);
  captureVisibleLinesWithNumbers(scroller, acc);
  collectCandidatesForSelector(scroller, ".cm-content .ol-cm-change-c", changeCommentCandidates);
  scroller.scrollTop = originalTop;

  if (!acc.size) {
    const fallback = buildEditorLinesFromDom();
    if (changeCommentCandidates.size) {
      return {
        ...fallback,
        changeCommentCandidates: Array.from(changeCommentCandidates.values())
      };
    }
    return fallback;
  }

  const maxLineNo = Math.max(...Array.from(acc.keys()));
  const fullParts: string[] = [];
  let missing = 0;
  for (let n = 1; n <= maxLineNo; n += 1) {
    const txt = acc.get(n);
    if (txt == null) {
      missing += 1;
      fullParts.push("");
    } else {
      fullParts.push(txt);
    }
  }

  const fullText = fullParts.join("\n");
  const coverage = maxLineNo > 0 ? (maxLineNo - missing) / maxLineNo : 0;

  return {
    lines: buildLinesFromText(fullText),
    fullText,
    source: "dom-scroll-harvest",
    lineCoverage: coverage,
    changeCommentCandidates: Array.from(changeCommentCandidates.values())
  };
}

async function buildEditorLines(): Promise<EditorLines> {
  const fullTextFromState = getEditorTextFromCodeMirrorState();
  if (fullTextFromState != null) {
    const scrollHarvested = await buildEditorLinesByScrollingDom();
    console.log("buildEditorLines: Using CodeMirror state", { textLen: fullTextFromState.length, sample: fullTextFromState.substring(0, 100) });
    return {
      lines: buildLinesFromText(fullTextFromState),
      fullText: fullTextFromState.replace(/\r\n?/g, "\n"),
      source: "codemirror-state",
      lineCoverage: 1,
      changeCommentCandidates: scrollHarvested.changeCommentCandidates
    };
  }

  console.warn("buildEditorLines: CodeMirror state unavailable, trying scroll harvest");
  const harvested = await buildEditorLinesByScrollingDom();
  if (harvested.fullText.length > 0) {
    return harvested;
  }

  console.warn("buildEditorLines: Scroll harvest failed, falling back to visible DOM lines");
  return buildEditorLinesFromDom();
}

function getTextFragments(node: Element): string[] {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const fragments: string[] = [];

  let current = walker.nextNode();
  while (current) {
    const text = current.textContent ?? "";
    if (hasAnyText(text)) {
      fragments.push(text);
    }
    current = walker.nextNode();
  }

  return fragments;
}

function getUniqueCandidatesForSelector(selector: string): HighlightCandidate[] {
  const rawNodes = Array.from(document.querySelectorAll(selector));
  const nodes = rawNodes.filter((node) => {
    const parentMatch = (node.parentElement?.closest(selector) as Element | null);
    return parentMatch == null || parentMatch === node;
  });
  const seen = new Set<string>();
  const candidates: HighlightCandidate[] = [];

  for (const node of nodes) {
    const text = node.textContent ?? "";
    if (!hasAnyText(text) || seen.has(text)) {
      continue;
    }
    seen.add(text);
    const fragments = getTextFragments(node as Element);
    candidates.push({
      text,
      fragments: fragments.length ? fragments : [text]
    });
  }

  return candidates;
}

function mergeCandidateLists(
  primary: HighlightCandidate[],
  fallback: HighlightCandidate[]
): HighlightCandidate[] {
  if (!fallback.length) {
    return primary;
  }

  const seen = new Set(primary.map((candidate) => candidate.text));
  const merged = [...primary];
  for (const candidate of fallback) {
    if (seen.has(candidate.text)) {
      continue;
    }
    seen.add(candidate.text);
    merged.push(candidate);
  }
  return merged;
}

function getOrderedHighlightTextsForSelector(selector: string): string[] {
  const nodes = Array.from(document.querySelectorAll(selector));
  const texts: string[] = [];

  for (const node of nodes) {
    const text = (node as Element).textContent ?? "";
    if (hasAnyText(text)) {
      texts.push(text);
    }
  }

  return texts;
}

type LocalContextAnchor = {
  context: string;
  contextStart: number;
  contextEnd: number;
  localDataPos: number;
};

function getLocalDataPosInContext(fullText: string, dataPos: number, contextRadius = 900): LocalContextAnchor | null {
  if (!Number.isFinite(dataPos) || dataPos < 0 || dataPos >= fullText.length) {
    return null;
  }

  const contextStart = Math.max(0, dataPos - contextRadius);
  const contextEnd = Math.min(fullText.length, dataPos + contextRadius);
  const context = fullText.slice(contextStart, contextEnd);
  return {
    context,
    contextStart,
    contextEnd,
    localDataPos: dataPos - contextStart
  };
}

type IndexedSpanText = {
  start: number;
  end: number;
};

function indexSelectorTextsInFullText(fullText: string, selector: string): IndexedSpanText[] {
  const nodes = Array.from(document.querySelectorAll(selector));
  const indexed: IndexedSpanText[] = [];
  let cursor = 0;

  for (const node of nodes) {
    const text = (node as Element).textContent ?? "";
    if (!hasAnyText(text)) {
      continue;
    }

    let idx = fullText.indexOf(text, cursor);
    if (idx < 0) {
      idx = fullText.indexOf(text);
    }
    if (idx < 0) {
      continue;
    }

    const end = idx + text.length;
    indexed.push({ start: idx, end });
    cursor = end;
  }

  return indexed;
}

function pickAnchoredSpanByLocalContext(fullText: string, dataPos: number, selector: string): string {
  const localAnchor = getLocalDataPosInContext(fullText, dataPos, 900);
  if (!localAnchor) {
    return "";
  }
  const { contextStart, contextEnd, localDataPos } = localAnchor;
  const indexedSpans = indexSelectorTextsInFullText(fullText, selector)
    .filter((span) => span.end > contextStart && span.start < contextEnd);

  if (!indexedSpans.length) {
    return "";
  }

  let anchorIndex = -1;
  for (let i = 0; i < indexedSpans.length; i += 1) {
    const span = indexedSpans[i];
    // Strict anchoring: highlighted span must begin exactly at dataPos.
    if (span.start === dataPos) {
      anchorIndex = i;
      break;
    }
  }

  if (anchorIndex < 0) {
    return "";
  }

  let start = indexedSpans[anchorIndex].start;
  let end = indexedSpans[anchorIndex].end;
  const maxGap = 24;

  for (let i = anchorIndex + 1; i < indexedSpans.length; i += 1) {
    const next = indexedSpans[i];
    if (next.start > contextEnd + 40) {
      break;
    }

    const gap = next.start - end;
    if (gap < 0) {
      if (next.end > end) {
        end = next.end;
      }
      continue;
    }

    if (gap > maxGap) {
      break;
    }

    end = next.end;
  }

  const resolved = fullText.slice(start, end);
  if (!resolved) {
    return "";
  }

  return resolved;
}

function pickAnchoredSpanChainAtPos(fullText: string, dataPos: number, selector: string): string {
  const localAnchor = getLocalDataPosInContext(fullText, dataPos, 1200);
  if (!localAnchor) {
    return "";
  }
  const context = localAnchor.context.toLowerCase();
  const localDataPos = localAnchor.localDataPos;
  const contextStart = localAnchor.contextStart;
  const ordered = getOrderedHighlightTextsForSelector(selector);
  if (!ordered.length) {
    return "";
  }

  let bestText = "";
  let bestIdx = -1;
  let bestNode = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < ordered.length; i += 1) {
    const text = ordered[i];
    if (!hasAnyText(text)) {
      continue;
    }

    const idx = fullText.indexOf(text, Math.max(0, dataPos));
    if (idx !== dataPos) {
      continue;
    }

    const lower = text.toLowerCase();
    const contextMatch = !!context && context.includes(lower);
    const localStart = idx - contextStart;
    const localDist = Math.abs(localStart - localDataPos);

    const score =
      (contextMatch ? 220 : 0)
      + Math.min(text.length, 80)
      - localDist;

    if (score > bestScore) {
      bestScore = score;
      bestText = text;
      bestIdx = idx;
      bestNode = i;
    }
  }

  if (!bestText || bestIdx < 0 || bestNode < 0) {
    // Fallback path: anchor to the token at dataPos and grow through adjacent DOM spans.
    return pickAnchoredSpanByLocalContext(fullText, dataPos, selector);
  }

  let resolved = bestText;
  let cursor = bestIdx + bestText.length;
  const maxChainSpan = 1500;

  // Walk forward in DOM highlight order to infer where the highlighted run ends.
  for (let i = bestNode + 1; i < ordered.length; i += 1) {
    const next = ordered[i];
    if (!hasAnyText(next)) {
      continue;
    }

    const nextIdx = fullText.indexOf(next, Math.max(0, cursor));
    if (nextIdx < 0 || nextIdx < cursor) {
      continue;
    }

    if (nextIdx - bestIdx > maxChainSpan) {
      break;
    }

    const join = fullText.slice(cursor, nextIdx);
    resolved = `${resolved}${join}${next}`;
    cursor = nextIdx + next.length;
  }

  return resolved;
}

function getExactCandidateMatchAtPos(
  fullText: string,
  dataPos: number,
  candidate: HighlightCandidate
): ExactCandidateMatch | null {
  if (dataPos < 0 || dataPos >= fullText.length) {
    return null;
  }

  if (!candidate.fragments.length) {
    return null;
  }

  const firstFragment = candidate.fragments[0];
  const firstIdx = dataPos;
  if (!fullText.startsWith(firstFragment, firstIdx)) {
    return null;
  }

  let cursor = firstIdx + firstFragment.length;
  let foundCount = 1;
  let lastEnd = cursor;

  for (let i = 1; i < candidate.fragments.length; i += 1) {
    const fragment = candidate.fragments[i];
    const idx = fullText.indexOf(fragment, cursor);
    if (idx < 0) {
      return null;
    }

    lastEnd = idx + fragment.length;
    cursor = idx + fragment.length;
    foundCount += 1;
  }

  if (foundCount === 0 || lastEnd < 0) {
    return null;
  }

  return {
    text: candidate.text,
    fragmentCount: foundCount,
    spanLength: lastEnd - firstIdx,
    distance: 0
  };
}

function pickExactCandidateAtPos(fullText: string, dataPos: number, candidates: HighlightCandidate[]): string {
  let best: ExactCandidateMatch | null = null;

  for (const candidate of candidates) {
    const match = getExactCandidateMatchAtPos(fullText, dataPos, candidate);
    if (!match) {
      continue;
    }

    const shouldReplace =
      !best
      || match.fragmentCount > best.fragmentCount
      || (match.fragmentCount === best.fragmentCount && match.distance < best.distance)
      || (match.fragmentCount === best.fragmentCount
        && match.distance === best.distance
        && match.spanLength < best.spanLength);

    if (shouldReplace) {
      best = match;
    }
  }

  return best?.text ?? "";
}

function findClosestIndexInWindow(fullText: string, fragment: string, dataPos: number, window: number): number {
  const minStart = Math.max(0, dataPos - window);
  const maxStart = Math.min(fullText.length - fragment.length, dataPos + window);
  if (maxStart < minStart) {
    return -1;
  }

  let bestIdx = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  let searchFrom = minStart;

  while (searchFrom <= maxStart) {
    const idx = fullText.indexOf(fragment, searchFrom);
    if (idx < 0 || idx > maxStart) {
      break;
    }

    const dist = Math.abs(idx - dataPos);
    if (dist < bestDist || (dist === bestDist && idx < bestIdx)) {
      bestIdx = idx;
      bestDist = dist;
    }

    searchFrom = idx + 1;
  }

  return bestIdx;
}

function getForwardNonWhitespaceAnchor(fullText: string, dataPos: number, maxSkip = 3): number {
  if (dataPos < 0 || dataPos >= fullText.length) {
    return dataPos;
  }

  let anchor = dataPos;
  let skipped = 0;
  while (anchor < fullText.length && skipped < maxSkip && isWhitespaceChar(fullText[anchor])) {
    anchor += 1;
    skipped += 1;
  }
  return anchor;
}

function getNearCandidateMatchAtPos(
  fullText: string,
  dataPos: number,
  candidate: HighlightCandidate,
  window = 3
): NearCandidateMatch | null {
  // Near matching is intentionally disabled: highlights must start exactly at dataPos.
  void fullText;
  void dataPos;
  void candidate;
  void window;
  return null;
}

function pickNearCandidateAtPos(
  fullText: string,
  dataPos: number,
  candidates: HighlightCandidate[],
  window = 3
): string {
  let best: NearCandidateMatch | null = null;

  for (const candidate of candidates) {
    const match = getNearCandidateMatchAtPos(fullText, dataPos, candidate, window);
    if (!match) {
      continue;
    }

    const shouldReplace =
      !best
      || match.distance < best.distance
      || (match.distance === best.distance && match.fragmentCount > best.fragmentCount)
      || (match.distance === best.distance
        && match.fragmentCount === best.fragmentCount
        && match.spanLength < best.spanLength);

    if (shouldReplace) {
      best = match;
    }
  }

  return best?.text ?? "";
}

function pickBestNearBucketMatchAtPos(
  fullText: string,
  dataPos: number,
  buckets: Array<{ source: string; candidates: HighlightCandidate[] }>,
  window = 3
): NearBucketMatch | null {
  let best: NearBucketMatch | null = null;

  const sourcePenalty = (source: string): number => {
    // Focus buckets can reflect stale UI state; prefer explicit highlight/change buckets when similarly close.
    if (source === "focusComment" || source === "focusAny") {
      return 1;
    }
    return 0;
  };

  for (const bucket of buckets) {
    for (const candidate of bucket.candidates) {
      const match = getNearCandidateMatchAtPos(fullText, dataPos, candidate, window);
      if (!match) {
        continue;
      }

      const adjustedDistance = match.distance + sourcePenalty(bucket.source);
      const bestAdjustedDistance = best ? best.distance + sourcePenalty(best.source) : Number.POSITIVE_INFINITY;

      const shouldReplace =
        !best
        || adjustedDistance < bestAdjustedDistance
        || (adjustedDistance === bestAdjustedDistance && match.fragmentCount > best.fragmentCount)
        || (adjustedDistance === bestAdjustedDistance
          && match.fragmentCount === best.fragmentCount
          && match.spanLength < best.spanLength);

      if (shouldReplace) {
        best = {
          ...match,
          source: bucket.source
        };
      }
    }
  }

  return best;
}

function combineCandidateTextsWithOriginalGaps(
  fullText: string,
  candidates: HighlightCandidate[],
  dataPos = -1
): string {
  const texts = candidates
    .map((candidate) => candidate.text)
    .filter((text) => hasAnyText(text));

  if (!texts.length) {
    return "";
  }

  let resolved = texts[0];
  let cursor = -1;
  if (dataPos >= 0) {
    if (fullText.startsWith(texts[0], dataPos)) {
      cursor = dataPos;
    }
  } else {
    cursor = fullText.indexOf(texts[0]);
  }
  if (cursor >= 0) {
    cursor += texts[0].length;
  }

  for (let i = 1; i < texts.length; i += 1) {
    const text = texts[i];
    if (cursor >= 0) {
      const idx = fullText.indexOf(text, cursor);
      if (idx >= cursor) {
        resolved += fullText.slice(cursor, idx) + text;
        cursor = idx + text.length;
        continue;
      }
    }

    resolved += text;
    cursor = -1;
  }

  return resolved;
}

function getFocusedHighlightDetails(
  fullText: string,
  dataPos: number,
  globalChangeCommentCandidates: HighlightCandidate[] = []
): UiHighlightDetails {
  const highlightComment = getUniqueCandidatesForSelector(
    ".cm-content .ol-cm-change-highlight-c"
  );
  const buildCandidateSummary = (buckets: Array<[string, HighlightCandidate[]]>): string => {

    const entries: Array<{ label: string; text: string; dist: number }> = [];
    for (const [label, list] of buckets) {
      for (const c of list) {
        const text = c.text;
        if (!hasAnyText(text)) {
          continue;
        }
        const idx = fullText.indexOf(text, Math.max(0, dataPos - 80));
        const fallbackIdx = idx >= 0 ? idx : fullText.indexOf(text);
        const dist = fallbackIdx >= 0 ? Math.abs(fallbackIdx - dataPos) : 999999;
        entries.push({ label, text, dist });
      }
    }

    entries.sort((a, b) => a.dist - b.dist || a.text.length - b.text.length);
    const top = entries.slice(0, 8).map((e) => {
      const short = e.text.length > 36 ? `${e.text.slice(0, 36)}...` : e.text;
      return `${e.label}@${e.dist}:${short}`;
    });
    return top.join(" || ");
  };

  const hasHoveredReviewEntry =
    document.querySelector(".review-panel-entry-hover") != null;
  const combinedHoverHighlight = combineCandidateTextsWithOriginalGaps(fullText, highlightComment, dataPos);
  const hoverCandidateSummary = buildCandidateSummary([
    ["highlightComment", highlightComment]
  ]);

  if (hasHoveredReviewEntry && hasAnyText(combinedHoverHighlight)) {
    return {
      text: combinedHoverHighlight,
      source: "hoverCommentGlobal",
      candidateSummary: hoverCandidateSummary,
      focusCommentCount: 0,
      focusAnyCount: 0,
      highlightCommentCount: highlightComment.length,
      highlightAnyCount: 0,
      changeCommentCount: 0,
      changeAnyCount: 0
    };
  }

  const focusComment = getUniqueCandidatesForSelector(
    ".cm-content .ol-cm-change-focus .ol-cm-change-c, .cm-content .ol-cm-change-focus .ol-cm-change-highlight-c"
  );
  const focusAny = getUniqueCandidatesForSelector(
    ".cm-content .ol-cm-change-focus .ol-cm-change"
  );
  const highlightAny = getUniqueCandidatesForSelector(
    ".cm-content .ol-cm-change-highlight"
  );
  const changeComment = getUniqueCandidatesForSelector(
    ".cm-content .ol-cm-change-c"
  );
  const changeCommentMerged = mergeCandidateLists(changeComment, globalChangeCommentCandidates);
  const changeAny = getUniqueCandidatesForSelector(
    ".cm-content .ol-cm-change"
  );
  const candidateSummary = buildCandidateSummary([
    ["focusComment", focusComment],
    ["highlightComment", highlightComment],
    ["changeComment", changeComment],
    ["changeCommentGlobal", changeCommentMerged],
    ["focusAny", focusAny],
    ["highlightAny", highlightAny],
    ["changeAny", changeAny]
  ]);

  console.log("getFocusedHighlightDetails: bucket counts", {
    focusComment: focusComment.length,
    focusAny: focusAny.length,
    highlightComment: highlightComment.length,
    highlightAny: highlightAny.length,
    changeComment: changeComment.length,
    changeCommentGlobal: changeCommentMerged.length,
    changeAny: changeAny.length
  });

  const commentBuckets: Array<{ source: string; candidates: HighlightCandidate[] }> = [
    { source: "focusComment", candidates: focusComment },
    { source: "highlightComment", candidates: highlightComment },
    { source: "changeComment", candidates: changeComment }
  ];
  const anyBuckets: Array<{ source: string; candidates: HighlightCandidate[] }> = [
    { source: "focusAny", candidates: focusAny },
    { source: "highlightAny", candidates: highlightAny },
    { source: "changeAny", candidates: changeAny }
  ];
  const spanBuckets: Array<{ source: string; selector: string }> = [
    {
      source: "focusComment",
      selector: ".cm-content .ol-cm-change-focus .ol-cm-change-c, .cm-content .ol-cm-change-focus .ol-cm-change-highlight-c"
    },
    {
      source: "highlightComment",
      selector: ".cm-content .ol-cm-change-highlight-c"
    },
    {
      source: "changeComment",
      selector: ".cm-content .ol-cm-change-c"
    },
    {
      source: "focusAny",
      selector: ".cm-content .ol-cm-change-focus .ol-cm-change"
    },
    {
      source: "highlightAny",
      selector: ".cm-content .ol-cm-change-highlight"
    },
    {
      source: "changeAny",
      selector: ".cm-content .ol-cm-change"
    }
  ];
  const commentSpanBuckets = spanBuckets.filter((bucket) =>
    bucket.source === "focusComment"
    || bucket.source === "highlightComment"
    || bucket.source === "changeComment"
  );
  const anySpanBuckets = spanBuckets.filter((bucket) =>
    bucket.source === "focusAny"
    || bucket.source === "highlightAny"
    || bucket.source === "changeAny"
  );

  if (dataPos < 0 || dataPos >= fullText.length) {
    return {
      text: "",
      source: "invalidDataPos",
      candidateSummary,
      focusCommentCount: focusComment.length,
      focusAnyCount: focusAny.length,
      highlightCommentCount: highlightComment.length,
      highlightAnyCount: highlightAny.length,
      changeCommentCount: changeComment.length,
      changeAnyCount: changeAny.length
    };
  }

  // 1) Exact focus-comment match.
  const exactFocusComment = pickExactCandidateAtPos(fullText, dataPos, focusComment);
  if (exactFocusComment) {
    return {
      text: exactFocusComment,
      source: "focusComment",
      candidateSummary,
      focusCommentCount: focusComment.length,
      focusAnyCount: focusAny.length,
      highlightCommentCount: highlightComment.length,
      highlightAnyCount: highlightAny.length,
      changeCommentCount: changeComment.length,
      changeAnyCount: changeAny.length
    };
  }

  // 1b) Exact anchored span reconstruction on comment buckets.
  for (const bucket of commentSpanBuckets) {
    const text = pickAnchoredSpanChainAtPos(fullText, dataPos, bucket.selector);
    if (text) {
      return {
        text,
        source: `${bucket.source}AnchoredSpan`,
        candidateSummary,
        focusCommentCount: focusComment.length,
        focusAnyCount: focusAny.length,
        highlightCommentCount: highlightComment.length,
        highlightAnyCount: highlightAny.length,
        changeCommentCount: changeComment.length,
        changeAnyCount: changeAny.length
      };
    }
  }

  // 2) Exact highlight-comment match.
  const exactHighlightComment = pickExactCandidateAtPos(fullText, dataPos, highlightComment);
  if (exactHighlightComment) {
    return {
      text: exactHighlightComment,
      source: "highlightComment",
      candidateSummary,
      focusCommentCount: focusComment.length,
      focusAnyCount: focusAny.length,
      highlightCommentCount: highlightComment.length,
      highlightAnyCount: highlightAny.length,
      changeCommentCount: changeComment.length,
      changeAnyCount: changeAny.length
    };
  }

  // 3) Exact change-comment match.
  const exactChangeComment = pickExactCandidateAtPos(fullText, dataPos, changeComment);
  if (exactChangeComment) {
    return {
      text: exactChangeComment,
      source: "changeComment",
      candidateSummary,
      focusCommentCount: focusComment.length,
      focusAnyCount: focusAny.length,
      highlightCommentCount: highlightComment.length,
      highlightAnyCount: highlightAny.length,
      changeCommentCount: changeComment.length,
      changeAnyCount: changeAny.length
    };
  }

  // 3b) Exact change-comment match from global scroll-time pool.
  const exactChangeCommentGlobal = pickExactCandidateAtPos(fullText, dataPos, changeCommentMerged);
  if (exactChangeCommentGlobal) {
    return {
      text: exactChangeCommentGlobal,
      source: "changeCommentGlobalPool",
      candidateSummary,
      focusCommentCount: focusComment.length,
      focusAnyCount: focusAny.length,
      highlightCommentCount: highlightComment.length,
      highlightAnyCount: highlightAny.length,
      changeCommentCount: changeComment.length,
      changeAnyCount: changeAny.length
    };
  }

  // 6) Broader any-bucket matches after comment-bucket path is exhausted.
  for (const bucket of anyBuckets) {
    const text = pickExactCandidateAtPos(fullText, dataPos, bucket.candidates);
    if (text) {
      return {
        text,
        source: bucket.source,
        candidateSummary,
        focusCommentCount: focusComment.length,
        focusAnyCount: focusAny.length,
        highlightCommentCount: highlightComment.length,
        highlightAnyCount: highlightAny.length,
        changeCommentCount: changeComment.length,
        changeAnyCount: changeAny.length
      };
    }
  }

  for (const bucket of anySpanBuckets) {
    const text = pickAnchoredSpanChainAtPos(fullText, dataPos, bucket.selector);
    if (text) {
      return {
        text,
        source: `${bucket.source}AnchoredSpan`,
        candidateSummary,
        focusCommentCount: focusComment.length,
        focusAnyCount: focusAny.length,
        highlightCommentCount: highlightComment.length,
        highlightAnyCount: highlightAny.length,
        changeCommentCount: changeComment.length,
        changeAnyCount: changeAny.length
      };
    }
  }

  return {
    text: "",
    source: "none",
    candidateSummary,
    focusCommentCount: focusComment.length,
    focusAnyCount: focusAny.length,
    highlightCommentCount: highlightComment.length,
    highlightAnyCount: highlightAny.length,
    changeCommentCount: changeComment.length,
    changeAnyCount: changeAny.length
  };
}

function isEntryHovered(entry: Element): boolean {
  return entry.classList.contains("review-panel-entry-hover");
}

function isEntryHighlighted(entry: Element): boolean {
  return entry.classList.contains("review-panel-entry-highlighted");
}

function isCurrentHoveredEntry(entry: Element): boolean {
  const current = document.querySelector(".review-panel-entry-hover");
  return current === entry;
}

function isCurrentHighlightedEntry(entry: Element): boolean {
  const current = document.querySelector(".review-panel-entry-highlighted");
  return current === entry;
}

function isEntryActive(entry: Element): boolean {
  return isCurrentHoveredEntry(entry)
    || isEntryHovered(entry)
    || isCurrentHighlightedEntry(entry)
    || isEntryHighlighted(entry);
}

function dispatchMouseEvent(target: HTMLElement, type: string): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
}

async function hoverReviewEntry(entry: Element): Promise<void> {
  const target =
    (entry.querySelector(".review-panel-entry-content") as HTMLElement | null)
    ?? (entry.querySelector(".review-panel-comment-body") as HTMLElement | null)
    ?? (entry.querySelector(".review-panel-entry-indicator") as HTMLElement | null)
    ?? (entry as HTMLElement);
  const awayTarget = (document.querySelector(".review-panel") as HTMLElement | null) ?? document.body;

  console.log("hoverReviewEntry: Activating entry with click/hover cycle", {
    hasContent: entry.querySelector(".review-panel-entry-content") != null,
    hasCommentBody: entry.querySelector(".review-panel-comment-body") != null,
    hasIndicator: entry.querySelector(".review-panel-entry-indicator") != null
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    target.scrollIntoView({ block: "nearest", inline: "nearest" });

    // Initial hover and click on the comment entry.
    dispatchMouseEvent(target, "mouseenter");
    dispatchMouseEvent(target, "mouseover");
    dispatchMouseEvent(target, "mousemove");
    dispatchMouseEvent(target, "mousedown");
    dispatchMouseEvent(target, "mouseup");
    dispatchMouseEvent(target, "click");
    await sleep(70);

    // Hover away, then hover back to trigger Overleaf's visual highlight refresh.
    dispatchMouseEvent(target, "mouseleave");
    dispatchMouseEvent(target, "mouseout");
    dispatchMouseEvent(awayTarget, "mousemove");
    dispatchMouseEvent(awayTarget, "mouseover");
    await sleep(50);

    dispatchMouseEvent(target, "mouseenter");
    dispatchMouseEvent(target, "mouseover");
    dispatchMouseEvent(target, "mousemove");
    await sleep(90);

    if (isEntryActive(entry)) {
      break;
    }
  }
}

async function hoverOnlyReviewEntry(entry: Element): Promise<void> {
  const target =
    (entry.querySelector(".review-panel-entry-content") as HTMLElement | null)
    ?? (entry.querySelector(".review-panel-comment-body") as HTMLElement | null)
    ?? (entry.querySelector(".review-panel-entry-indicator") as HTMLElement | null)
    ?? (entry as HTMLElement);
  const awayTarget = (document.querySelector(".review-panel") as HTMLElement | null) ?? document.body;

  console.log("hoverOnlyReviewEntry: Activating entry with hover-only cycle");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    dispatchMouseEvent(target, "mouseenter");
    dispatchMouseEvent(target, "mouseover");
    dispatchMouseEvent(target, "mousemove");
    await sleep(100);

    dispatchMouseEvent(target, "mouseleave");
    dispatchMouseEvent(target, "mouseout");
    dispatchMouseEvent(awayTarget, "mousemove");
    dispatchMouseEvent(awayTarget, "mouseover");
    await sleep(60);

    dispatchMouseEvent(target, "mouseenter");
    dispatchMouseEvent(target, "mouseover");
    dispatchMouseEvent(target, "mousemove");
    await sleep(100);

    if (isEntryActive(entry)) {
      break;
    }
  }
}

function getVisibleLineRange(scroller: HTMLElement): { start: number; end: number } {
  const scrollerRect = scroller.getBoundingClientRect();
  const gutterEls = Array.from(scroller.querySelectorAll(".cm-lineNumbers .cm-gutterElement"))
    .filter((el): el is HTMLElement => el instanceof HTMLElement);
  const lines = gutterEls
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const visible = rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom;
      if (!visible) {
        return null;
      }
      return parseLineNumber(el.textContent ?? "");
    })
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);

  if (!lines.length) {
    return { start: -1, end: -1 };
  }

  return { start: lines[0], end: lines[lines.length - 1] };
}

type VisibleGutterEntry = {
  lineNo: number;
  top: number;
  el: HTMLElement;
};

function getVisibleGutterEntries(scroller: HTMLElement): VisibleGutterEntry[] {
  const scrollerRect = scroller.getBoundingClientRect();
  const gutterEls = Array.from(scroller.querySelectorAll(".cm-lineNumbers .cm-gutterElement"))
    .filter((el): el is HTMLElement => el instanceof HTMLElement);

  const entries: VisibleGutterEntry[] = [];
  for (const el of gutterEls) {
    const lineNo = parseLineNumber(el.textContent ?? "");
    if (lineNo == null) {
      continue;
    }
    const rect = el.getBoundingClientRect();
    const visible = rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom;
    if (!visible) {
      continue;
    }
    entries.push({ lineNo, top: rect.top, el });
  }

  entries.sort((a, b) => a.lineNo - b.lineNo);
  return entries;
}

function estimatePixelsPerLine(entries: VisibleGutterEntry[]): number {
  if (entries.length < 2) {
    return 0;
  }

  const samples: number[] = [];
  for (let i = 1; i < entries.length; i += 1) {
    const prev = entries[i - 1];
    const curr = entries[i];
    const lineDelta = curr.lineNo - prev.lineNo;
    if (lineDelta <= 0) {
      continue;
    }
    const pxDelta = curr.top - prev.top;
    if (pxDelta <= 0) {
      continue;
    }
    samples.push(pxDelta / lineDelta);
  }

  if (!samples.length) {
    return 0;
  }

  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  return Number.isFinite(avg) ? avg : 0;
}

function buildScrollCheck(scroller: HTMLElement | null, targetLine: number, method: string): ScrollCheck {
  if (!scroller || targetLine < 0) {
    return {
      method,
      targetLine,
      visibleStart: -1,
      visibleEnd: -1,
      targetVisible: false
    };
  }

  const range = getVisibleLineRange(scroller);
  return {
    method,
    targetLine,
    visibleStart: range.start,
    visibleEnd: range.end,
    targetVisible: range.start >= 0 && targetLine >= range.start && targetLine <= range.end
  };
}

function getLineNumberFromOffsets(lines: Array<[number, string]>, pos: number): number {
  if (!lines.length || pos < 0) {
    return -1;
  }

  for (let i = 0; i < lines.length; i += 1) {
    const [start, text] = lines[i];
    const end = start + text.length;
    if (start <= pos && pos <= end) {
      return i + 1;
    }
  }

  return -1;
}

function findGutterForLine(scroller: HTMLElement, targetLine: number): HTMLElement | null {
  const gutterEls = Array.from(scroller.querySelectorAll(".cm-lineNumbers .cm-gutterElement"))
    .filter((el): el is HTMLElement => el instanceof HTMLElement);

  for (const gutterEl of gutterEls) {
    if (parseLineNumber(gutterEl.textContent ?? "") === targetLine) {
      return gutterEl;
    }
  }

  return null;
}

async function tryAlignToGutterLine(scroller: HTMLElement, targetLine: number): Promise<boolean> {
  const gutterEl = findGutterForLine(scroller, targetLine);
  if (!gutterEl) {
    return false;
  }

  const targetTop = scroller.scrollTop + gutterEl.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  scroller.scrollTop = Math.max(0, targetTop - scroller.clientHeight / 2);
  await sleep(70);
  return true;
}

async function scrollEditorToPos(pos: number, editorLines?: Array<[number, string]>): Promise<ScrollCheck> {
  if (pos < 0) {
    return {
      method: "invalid-pos",
      targetLine: -1,
      visibleStart: -1,
      visibleEnd: -1,
      targetVisible: false
    };
  }

  const scroller = document.querySelector(".cm-editor .cm-scroller") as HTMLElement | null;
  const view = getEditorViewLike();
  const targetLineFromDoc = view?.state.doc.lineAt?.(pos)?.number;
  const targetLineFromOffsets = editorLines ? getLineNumberFromOffsets(editorLines, pos) : -1;
  const targetLine = targetLineFromDoc ?? targetLineFromOffsets;

  if (view) {
    try {
      view.focus?.();
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      await sleep(80);
      return buildScrollCheck(scroller, targetLine, "cm-dispatch-scrollIntoView");
    } catch (error) {
      console.warn("scrollEditorToPos: CodeMirror dispatch scroll failed", { pos, error: String(error) });
    }
  }

  if (!scroller) {
    return buildScrollCheck(null, targetLine, "no-scroller");
  }

  const viewLine = targetLine;

  if (viewLine < 1) {
    return buildScrollCheck(scroller, targetLine, "manual-scroll-precheck-failed");
  }

  if (await tryAlignToGutterLine(scroller, viewLine)) {
    return buildScrollCheck(scroller, targetLine, "manual-gutter-align");
  }

  // Coarse jump using line ratio when we have harvested line offsets.
  if (editorLines && editorLines.length > 1) {
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (maxTop > 0) {
      const ratio = Math.max(0, Math.min(1, (viewLine - 1) / (editorLines.length - 1)));
      const estimatedTop = Math.floor(ratio * maxTop);
      scroller.scrollTop = Math.max(0, estimatedTop - Math.floor(scroller.clientHeight / 2));
      await sleep(80);

      if (await tryAlignToGutterLine(scroller, viewLine)) {
        return buildScrollCheck(scroller, targetLine, "manual-ratio-seek-align");
      }
    }
  }

  // Predictive jump by visible line delta when target is off-screen.
  const visibleEntries = getVisibleGutterEntries(scroller);
  const pxPerLine = estimatePixelsPerLine(visibleEntries);
  if (visibleEntries.length > 0 && pxPerLine > 0) {
    let nearest = visibleEntries[0];
    let nearestDist = Math.abs(viewLine - nearest.lineNo);
    for (const entry of visibleEntries) {
      const dist = Math.abs(viewLine - entry.lineNo);
      if (dist < nearestDist) {
        nearest = entry;
        nearestDist = dist;
      }
    }

    const lineDelta = viewLine - nearest.lineNo;
    if (lineDelta !== 0) {
      const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const nextTop = Math.max(0, Math.min(maxTop, scroller.scrollTop + lineDelta * pxPerLine));
      scroller.scrollTop = nextTop;
      await sleep(80);

      if (await tryAlignToGutterLine(scroller, viewLine)) {
        return buildScrollCheck(scroller, targetLine, "manual-line-delta-seek-align");
      }
    }
  }

  // Step towards the target line range if it's still not rendered.
  const step = Math.max(80, Math.floor(scroller.clientHeight * 0.85));
  for (let i = 0; i < 12; i += 1) {
    const range = getVisibleLineRange(scroller);
    if (range.start < 0 || range.end < 0) {
      break;
    }

    if (viewLine < range.start) {
      scroller.scrollTop = Math.max(0, scroller.scrollTop - step);
    } else if (viewLine > range.end) {
      const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = Math.min(maxTop, scroller.scrollTop + step);
    } else {
      if (await tryAlignToGutterLine(scroller, viewLine)) {
        return buildScrollCheck(scroller, targetLine, "manual-range-seek-align");
      }
      break;
    }

    await sleep(70);

    if (await tryAlignToGutterLine(scroller, viewLine)) {
      return buildScrollCheck(scroller, targetLine, "manual-step-seek-align");
    }
  }

  return buildScrollCheck(scroller, targetLine, "manual-target-line-not-found");
}

function getContextAtPos(editor: EditorLines, pos: number): [string, string] {
  const { lines, fullText } = editor;
  if (!lines.length || !fullText.length) {
    throw new Error("Exact context extraction failed: editor text is empty.");
  }

  if (pos < 0) {
    throw new Error(`Exact context extraction failed: invalid position ${pos}.`);
  }

  if (pos >= fullText.length) {
    throw new Error(`Exact context extraction failed: position ${pos} is outside editor text length ${fullText.length}.`);
  }

  const clampedPos = pos;
  console.log("getContextAtPos: Processing exact pos", { pos: clampedPos, fullTextLen: fullText.length });

  let highlighted = "";
  let anchorLineIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const [start, text] = lines[i];
    const end = start + text.length;
    if (start <= clampedPos && clampedPos <= end) {
      highlighted = text;
      anchorLineIndex = i;
      console.log("getContextAtPos: Found line containing exact position", { start, end, textLen: text.length, text: text.substring(0, 50) });
      break;
    }
  }

  if (anchorLineIndex < 0) {
    throw new Error(`Exact context extraction failed: no line contains position ${clampedPos}.`);
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

function getTokenAtPos(fullText: string, pos: number): string {
  if (pos < 0 || pos >= fullText.length) {
    return "";
  }

  const isNonSpace = (ch: string): boolean => ch.trim().length > 0;

  let center = pos;
  if (!isNonSpace(fullText[center])) {
    let found = -1;
    for (let d = 1; d <= 80; d += 1) {
      const right = pos + d;
      if (right < fullText.length && isNonSpace(fullText[right])) {
        found = right;
        break;
      }
      const left = pos - d;
      if (left >= 0 && isNonSpace(fullText[left])) {
        found = left;
        break;
      }
    }
    if (found < 0) {
      return "";
    }
    center = found;
  }

  let start = center;
  while (start > 0 && isNonSpace(fullText[start - 1])) {
    start -= 1;
  }

  let end = center + 1;
  while (end < fullText.length && isNonSpace(fullText[end])) {
    end += 1;
  }

  return fullText.slice(start, end).trim();
}

function isWhitespaceChar(ch: string): boolean {
  return /\s/.test(ch);
}

function isPhraseBoundaryChar(ch: string): boolean {
  return ch === "\n" || /[.!?;:]/.test(ch);
}

function findNearestNonWhitespaceIndex(fullText: string, pos: number, maxDistance = 80): number {
  if (pos < 0 || pos >= fullText.length) {
    return -1;
  }

  if (!isWhitespaceChar(fullText[pos])) {
    return pos;
  }

  for (let d = 1; d <= maxDistance; d += 1) {
    const right = pos + d;
    if (right < fullText.length && !isWhitespaceChar(fullText[right])) {
      return right;
    }

    const left = pos - d;
    if (left >= 0 && !isWhitespaceChar(fullText[left])) {
      return left;
    }
  }

  return -1;
}

function findPrevTokenSpan(fullText: string, fromExclusive: number): [number, number] | null {
  let i = fromExclusive - 1;
  while (i >= 0 && isWhitespaceChar(fullText[i])) {
    i -= 1;
  }

  if (i < 0 || isPhraseBoundaryChar(fullText[i])) {
    return null;
  }

  const end = i + 1;
  while (i >= 0 && !isWhitespaceChar(fullText[i]) && !isPhraseBoundaryChar(fullText[i])) {
    i -= 1;
  }
  return [i + 1, end];
}

function findNextTokenSpan(fullText: string, fromInclusive: number): [number, number] | null {
  let i = fromInclusive;
  while (i < fullText.length && isWhitespaceChar(fullText[i])) {
    i += 1;
  }

  if (i >= fullText.length || isPhraseBoundaryChar(fullText[i])) {
    return null;
  }

  const start = i;
  while (i < fullText.length && !isWhitespaceChar(fullText[i]) && !isPhraseBoundaryChar(fullText[i])) {
    i += 1;
  }
  return [start, i];
}

function getPhraseAtPos(fullText: string, pos: number, maxTokens = 10, maxChars = 140): string {
  const center = findNearestNonWhitespaceIndex(fullText, pos);
  if (center < 0 || isPhraseBoundaryChar(fullText[center])) {
    return "";
  }

  let start = center;
  while (start > 0 && !isWhitespaceChar(fullText[start - 1]) && !isPhraseBoundaryChar(fullText[start - 1])) {
    start -= 1;
  }

  let end = center + 1;
  while (end < fullText.length && !isWhitespaceChar(fullText[end]) && !isPhraseBoundaryChar(fullText[end])) {
    end += 1;
  }

  let tokenCount = 1;

  while (tokenCount < maxTokens) {
    const prev = findPrevTokenSpan(fullText, start);
    if (!prev) {
      break;
    }
    const [prevStart] = prev;
    if (end - prevStart > maxChars) {
      break;
    }
    start = prevStart;
    tokenCount += 1;
  }

  while (tokenCount < maxTokens) {
    const next = findNextTokenSpan(fullText, end);
    if (!next) {
      break;
    }
    const [, nextEnd] = next;
    if (nextEnd - start > maxChars) {
      break;
    }
    end = nextEnd;
    tokenCount += 1;
  }

  return fullText.slice(start, end);
}

function reconcileUiHighlightWithPhrase(fullText: string, dataPos: number, uiHighlight: string): string {
  const ui = uiHighlight;
  if (!hasAnyText(ui)) {
    return "";
  }

  // If UI text is already substantial, keep it as-is.
  if (ui.length >= 20) {
    return ui;
  }

  const phrase = getPhraseAtPos(fullText, dataPos, 12, 160);
  if (!phrase || phrase.length <= ui.length) {
    return ui;
  }

  return phrase.toLowerCase().startsWith(ui.toLowerCase()) ? phrase : ui;
}

function getSelectorForUiSource(source: string, baseHighlight = ""): string | null {
  const canonicalSource = source.replace(/(Near|AnchoredSpan|Closest|Global)$/, "");

  if (canonicalSource === "focusComment") {
    const shortBase = baseHighlight.length <= 6;
    if (shortBase) {
      return [
        ".cm-content .ol-cm-change-focus .ol-cm-change-c",
        ".cm-content .ol-cm-change-focus .ol-cm-change-highlight-c",
        ".cm-content .ol-cm-change-highlight-c",
        ".cm-content .ol-cm-change-c"
      ].join(", ");
    }
    return ".cm-content .ol-cm-change-focus .ol-cm-change-c, .cm-content .ol-cm-change-focus .ol-cm-change-highlight-c";
  }
  if (canonicalSource === "highlightComment") {
    return ".cm-content .ol-cm-change-highlight-c";
  }
  if (canonicalSource === "changeComment") {
    return ".cm-content .ol-cm-change-c";
  }
  return null;
}

function extendUiHighlightAcrossAdjacentCandidates(
  fullText: string,
  dataPos: number,
  uiHighlight: string,
  uiSource: string
): string {
  const base = uiHighlight;
  if (!hasAnyText(base) || dataPos < 0 || dataPos >= fullText.length) {
    return base;
  }

  const selector = getSelectorForUiSource(uiSource, base);
  if (!selector) {
    return base;
  }

  const candidates = getUniqueCandidatesForSelector(selector)
    .map((c) => c.text)
    .filter((t) => !!t);
  if (candidates.length < 2) {
    return base;
  }

  const anchoredBaseIdx = fullText.indexOf(base, Math.max(0, dataPos - 4));
  const baseIdx = anchoredBaseIdx >= 0 ? anchoredBaseIdx : fullText.indexOf(base);
  let cursor = (baseIdx >= 0 ? baseIdx : dataPos) + base.length;
  let resolved = base;
  const used = new Set<string>([base]);

  // Append nearby highlighted fragments that continue immediately after the first match.
  for (let pass = 0; pass < 8; pass += 1) {
    let bestText = "";
    let bestIdx = Number.POSITIVE_INFINITY;

    for (const text of candidates) {
      if (!text || used.has(text)) {
        continue;
      }

      const idx = fullText.indexOf(text, Math.max(0, cursor - 1));
      if (idx < 0) {
        continue;
      }

      const gap = idx - cursor;
      if (gap < 0 || gap > 3) {
        continue;
      }

      if (idx < bestIdx || (idx === bestIdx && text.length > bestText.length)) {
        bestIdx = idx;
        bestText = text;
      }
    }

    if (!bestText || !Number.isFinite(bestIdx)) {
      break;
    }

    const join = fullText.slice(cursor, bestIdx);
    resolved = `${resolved}${join}${bestText}`;
    cursor = bestIdx + bestText.length;
    used.add(bestText);
  }

  return resolved;
}

function resolveHighlightAtPos(fullText: string, dataPos: number, uiDetails: UiHighlightDetails): HighlightResolution {
  const uiHighlight = uiDetails.text;
  const phrase = getPhraseAtPos(fullText, dataPos, 10, 140);
  const isWeakUiSource = /Closest$/.test(uiDetails.source);
  const canonicalUiSource = uiDetails.source.replace(/(Near|AnchoredSpan|Closest|Global)$/g, "");
  const isExactCommentLikeSource =
    canonicalUiSource === "focusComment"
    || canonicalUiSource === "highlightComment"
    || canonicalUiSource === "changeComment"
    || canonicalUiSource === "changeCommentGlobalPool";
  if (uiHighlight) {
    if (isWeakUiSource && phrase && phrase !== uiHighlight) {
      const phraseTokenCount = phrase.trim().split(/\s+/).filter(Boolean).length;
      if (phrase.length > uiHighlight.length && (phraseTokenCount >= 1 || phrase.length >= 3)) {
        return {
          text: phrase,
          source: `uiHighlightFallbackPhrase:${uiDetails.source}`,
          confidence: "medium"
        };
      }
    }

    const multilineExtended = extendUiHighlightAcrossAdjacentCandidates(fullText, dataPos, uiHighlight, uiDetails.source);
    const reconciled = isExactCommentLikeSource
      ? multilineExtended
      : reconcileUiHighlightWithPhrase(fullText, dataPos, multilineExtended);
    const reconcileDecision = isExactCommentLikeSource
      ? "reconcileSkippedExactSource"
      : (reconciled !== multilineExtended ? "reconcileApplied" : "reconcileNoChange");
    const uiSourceLabel = multilineExtended !== uiHighlight
      ? `uiHighlightExactMultiLine:${uiDetails.source}`
      : `uiHighlightExact:${uiDetails.source}`;
    return {
      text: reconciled,
      source: `${uiSourceLabel}:${reconcileDecision}`,
      confidence: "high"
    };
  }

  const token = getTokenAtPos(fullText, dataPos);

  if (phrase && phrase.split(/\s+/).length >= 2) {
    return {
      text: phrase,
      source: "posPhraseFallback",
      confidence: "medium"
    };
  }

  if (token) {
    return {
      text: token,
      source: "posTokenFallback",
      confidence: "low"
    };
  }

  return {
    text: "",
    source: "noHighlightResolved",
    confidence: "none"
  };
}

function isScrollableElement(el: HTMLElement): boolean {
  if (el.clientHeight <= 0) {
    return false;
  }

  if (el.scrollHeight <= el.clientHeight + 1) {
    return false;
  }

  const style = window.getComputedStyle(el);
  return style.overflowY === "auto" || style.overflowY === "scroll";
}

function getReviewPanelScroller(): HTMLElement | null {
  const explicitCandidates = Array.from(document.querySelectorAll(
    ".review-panel .review-panel-body, .review-panel .review-panel-entries, .review-panel .review-panel-content, .review-panel"
  )).filter((el): el is HTMLElement => el instanceof HTMLElement);

  for (const candidate of explicitCandidates) {
    if (isScrollableElement(candidate) && candidate.querySelector(".review-panel-entry-comment")) {
      return candidate;
    }
  }

  const firstEntry = document.querySelector(".review-panel-entry-comment") as HTMLElement | null;
  if (!firstEntry) {
    return null;
  }

  let parent = firstEntry.parentElement;
  while (parent) {
    if (isScrollableElement(parent)) {
      return parent;
    }
    parent = parent.parentElement;
  }

  return null;
}

function getReviewEntryKey(entry: Element): string {
  const threadId = extractThreadId(entry);
  const dataPos = getEntryDataPos(entry);
  const firstBody = (entry.querySelector(".review-panel-comment-body")?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return `${threadId}|${dataPos}|${firstBody}`;
}

async function processReviewEntry(params: {
  entry: Element;
  editor: EditorLines;
  rows: CommentRow[];
  errors: string[];
}): Promise<void> {
  const { entry, editor, rows, errors } = params;

  let threadId = "";
  let dataPos = -1;
  let uiDetails: UiHighlightDetails = {
    text: "",
    source: "not-run",
    candidateSummary: "",
    focusCommentCount: 0,
    focusAnyCount: 0,
    highlightCommentCount: 0,
    highlightAnyCount: 0,
    changeCommentCount: 0,
    changeAnyCount: 0
  };
  let uiHighlight = "";
  let interactionMode: "hover-click-cycle" | "hover-only" = "hover-click-cycle";
  let activePos = -1;
  let entryHighlighted = false;
  let scrollCheck: ScrollCheck = {
    method: "not-run",
    targetLine: -1,
    visibleStart: -1,
    visibleEnd: -1,
    targetVisible: false
  };

  try {
    const expandedInEntry = await expandCollapsedComments(entry);
    if (expandedInEntry > 0) {
      console.log("extractComments: Expanded collapsed comments in entry", { expandedInEntry });
    }

    threadId = extractThreadId(entry);
    dataPos = getEntryDataPos(entry);
    scrollCheck = await scrollEditorToPos(dataPos, editor.lines);
    interactionMode = "hover-click-cycle";
    await hoverReviewEntry(entry);
    await sleep(40);
    uiDetails = getFocusedHighlightDetails(editor.fullText, dataPos, editor.changeCommentCandidates);
    uiHighlight = uiDetails.text;

    if (!hasAnyText(uiHighlight)) {
      scrollCheck = await scrollEditorToPos(dataPos, editor.lines);
      interactionMode = "hover-only";
      await hoverOnlyReviewEntry(entry);
      await sleep(50);
      uiDetails = getFocusedHighlightDetails(editor.fullText, dataPos, editor.changeCommentCandidates);
      uiHighlight = uiDetails.text;
    }

    activePos = dataPos >= 0 && dataPos < editor.fullText.length ? dataPos : -1;
    let context = "";
    if (activePos >= 0) {
      [, context] = getContextAtPos(editor, activePos);
    }
    entryHighlighted = isCurrentHighlightedEntry(entry) || isEntryHighlighted(entry);

    const highlightResolution = activePos >= 0
      ? resolveHighlightAtPos(editor.fullText, activePos, uiDetails)
      : {
        text: "",
        source: "invalidDataPos",
        confidence: "none"
      } satisfies HighlightResolution;

    if (scrollCheck.targetLine < 0) {
      errors.push(
        `Thread ${threadId || "(no-thread-id)"}: unable to compute target line from data-pos ${dataPos}.`
      );
    }

    if (highlightResolution.confidence === "none") {
      errors.push(
        `Thread ${threadId || "(no-thread-id)"}: no highlight resolved at data-pos ${dataPos} (uiSource=${uiDetails.source}).`
      );
    }

    console.log("extractComments: Entry analysis", {
      threadId,
      dataPos,
      interactionMode,
      activePos,
      uiHighlight: uiHighlight.substring(0, 50),
      uiSource: uiDetails.source,
      resolvedHighlight: highlightResolution.text.substring(0, 50),
      confidence: highlightResolution.confidence
    });

    const highlightedText = highlightResolution.text;
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
        charPos: index === 0 ? activePos : ""
      });
      index += 1;
    }
  } catch (error) {
    const msg = String(error);
    errors.push(msg);
    console.warn("extractComments: Skipping thread after strict extraction error", { threadId, error: msg });
  }
}

async function extractComments(): Promise<ExtractCommentsResult> {
  const rows: CommentRow[] = [];
  const errors: string[] = [];
  const expandedBeforeExtraction = await expandCollapsedComments(document);
  console.log("extractComments: Expanded collapsed comments before extraction", { expandedBeforeExtraction });
  const editor = await buildEditorLines();
  console.log("extractComments: Editor lines built", {
    source: editor.source,
    lineCoverage: editor.lineCoverage,
    changeCommentCandidates: editor.changeCommentCandidates.length,
    linesCount: editor.lines.length,
    fullTextLen: editor.fullText.length,
    fullText: editor.fullText.substring(0, 200)
  });

  const seenEntryKeys = new Set<string>();
  const reviewPanelScroller = getReviewPanelScroller();

  if (reviewPanelScroller) {
    reviewPanelScroller.scrollTop = 0;
    await sleep(120);
  }

  const processVisibleEntries = async (): Promise<number> => {
    let processed = 0;
    const visibleEntries = Array.from(document.querySelectorAll(".review-panel-entry-comment"));
    for (const entry of visibleEntries) {
      const key = getReviewEntryKey(entry);
      if (seenEntryKeys.has(key)) {
        continue;
      }

      seenEntryKeys.add(key);
      await processReviewEntry({ entry, editor, rows, errors });
      processed += 1;
    }
    return processed;
  };

  if (!reviewPanelScroller) {
    console.warn("extractComments: Review panel scroller not found; processing only currently rendered entries");
    await processVisibleEntries();
  } else {
    let noProgressIterations = 0;

    for (let i = 0; i < 80; i += 1) {
      const beforeSeen = seenEntryKeys.size;
      const processedNow = await processVisibleEntries();
      const maxTop = Math.max(0, reviewPanelScroller.scrollHeight - reviewPanelScroller.clientHeight);
      const atBottom = reviewPanelScroller.scrollTop >= maxTop - 1;

      if (processedNow === 0) {
        noProgressIterations += 1;
      } else {
        noProgressIterations = 0;
      }

      if (atBottom && seenEntryKeys.size === beforeSeen) {
        break;
      }

      const prevTop = reviewPanelScroller.scrollTop;
      const step = Math.max(90, Math.floor(reviewPanelScroller.clientHeight * 0.85));
      reviewPanelScroller.scrollTop = Math.min(maxTop, prevTop + step);
      await sleep(140);

      const moved = Math.abs(reviewPanelScroller.scrollTop - prevTop) > 0.5;
      if (!moved && noProgressIterations >= 2) {
        break;
      }

      if (noProgressIterations >= 6) {
        break;
      }
    }

    console.log("extractComments: Completed scroll sweep", {
      uniqueEntriesProcessed: seenEntryKeys.size,
      rowsExported: rows.length
    });
  }

  return {
    rows,
    editorFullText: editor.fullText,
    editorTextSource: editor.source,
    editorTextLen: editor.fullText.length,
    errors
  };
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
    .then((result) => {
      sendResponse({
        ok: true,
        rows: result.rows,
        editorFullText: result.editorFullText,
        editorTextSource: result.editorTextSource,
        editorTextLen: result.editorTextLen,
        errors: result.errors
      });
    })
    .catch((error) => {
      sendResponse({ ok: false, error: String(error) });
    });

  return true;
});
