# Testing Guide

This project uses a combination of scripted checks and manual browser validation.

## 1. Scripted Validation

Run from extension directory:

```bash
cd extension
npm run typecheck
npm run build
npm run lint:firefox
npm run validate:release
```

Expected outcomes:

- TypeScript typecheck passes.
- Bundles are regenerated in extension/dist.
- web-ext lint completes without errors.
- Packaged artifact is generated in extension/web-ext-artifacts.

## 2. Manual Firefox Smoke Test

1. Open about:debugging in Firefox.
2. Load [extension/manifest.json](extension/manifest.json) as a temporary add-on.
3. Open an Overleaf project with multiple review threads.
4. Open the Review panel.
5. Export CSV and verify:
   - File downloads successfully.
   - Header columns match README schema.
   - Rows include expected author/comment/context values.
6. Export XLSX and verify:
   - File opens in spreadsheet software.
   - Header row is present.
   - Context cell highlights the detected highlighted text when available.

## 3. Regression Focus Areas

When changing extraction logic in extension/src/content.ts:

- Confirm comments with collapsed content are expanded before capture.
- Confirm virtualized review panel entries are still captured while scrolling.
- Confirm highlight fallback remains stable when direct UI highlights are unavailable.
- Confirm char position and context are populated or left empty in expected failure paths.

When changing export logic in extension/src/popup.ts:

- Confirm CSV escaping for commas, quotes, and newlines.
- Confirm XLSX generation produces readable files across common viewers.
- Confirm schema parity between CSV and XLSX outputs.

## 4. Documentation Consistency Checks

Before release, verify:

- [README.md](README.md) matches actual output columns and user flow.
- [PRIVACY.md](PRIVACY.md) matches real data behavior.
- [AMO_RELEASE_CHECKLIST.md](AMO_RELEASE_CHECKLIST.md) matches current package scripts.
