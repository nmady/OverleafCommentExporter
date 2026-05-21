# Highlight Detection Diagnostic

Run these commands in the browser DevTools console while on an Overleaf page with comments:

## 1. Find all spans in the editor with styling
```javascript
const content = document.querySelector(".cm-content");
const spans = content.querySelectorAll("span");
console.log("Total spans:", spans.length);
spans.forEach((span, i) => {
  const style = window.getComputedStyle(span);
  const text = span.textContent?.trim();
  if (text && text.length < 100) {
    console.log(i, {
      text: text.substring(0, 50),
      class: span.className,
      bg: style.backgroundColor,
      color: style.color,
      textDecoration: style.textDecoration
    });
  }
});
```

## 2. Look for marked/highlighted elements
```javascript
const content = document.querySelector(".cm-content");
console.log("Elements with 'highlight' class:");
content.querySelectorAll("[class*='highlight']").forEach(el => {
  console.log(el.className, el.textContent?.trim()?.substring(0, 50));
});

console.log("Mark elements:");
content.querySelectorAll("mark").forEach(el => {
  console.log(el.textContent?.trim());
});

console.log("All elements with background color:");
const allEl = content.querySelectorAll("*");
allEl.forEach(el => {
  const bg = window.getComputedStyle(el).backgroundColor;
  if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
    console.log({
      tag: el.tagName,
      class: el.className,
      bg,
      text: el.textContent?.trim()?.substring(0, 50)
    });
  }
});
```

## 3. Check CodeMirror state at position
```javascript
const editorEl = document.querySelector(".cm-editor");
const state = editorEl.cmView?.view?.state;
if (state) {
  console.log("CodeMirror state keys:", Object.keys(state));
  console.log("Selection:", state.selection);
  console.log("Doc length:", state.doc.length);
}
```

## 4. Get actual text at position
```javascript
// For dataPos = 1361 (first entry)
const pos = 1361;
const state = document.querySelector(".cm-editor").cmView?.view?.state;
if (state) {
  const fullText = state.doc.toString();
  // Get word boundaries around position
  let start = pos;
  let end = pos;
  
  while (start > 0 && /\S/.test(fullText[start - 1])) start--;
  while (end < fullText.length && /\S/.test(fullText[end])) end++;
  
  const word = fullText.slice(start, end);
  console.log("Word at position", pos, ":", word);
}
```

## 5. List all comment entries and their data-pos
```javascript
const entries = document.querySelectorAll(".review-panel-entry-comment");
entries.forEach((entry, i) => {
  const pos = entry.getAttribute("data-pos");
  const user = entry.querySelector(".review-panel-entry-user")?.textContent?.trim();
  const comment = entry.querySelector(".review-panel-comment-body")?.textContent?.trim();
  console.log(`Entry ${i}: pos=${pos}, user=${user}, comment=${comment?.substring(0, 40)}`);
});
```
