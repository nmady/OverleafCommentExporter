# Overleaf Comment Exporter

Browser extension for exporting Overleaf review comments to CSV or XLSX.

## What’s Here

- `extension/`: the Firefox-compatible browser extension.
- `samples/`: sample Overleaf exports and reference CSVs for comparison.

## Build

```bash
cd extension
npm install
npm run build
```

## Package For addons.mozilla.org (AMO)

```bash
cd extension
npm install
npm run package
```

The packaged artifact is written to `extension/web-ext-artifacts/`.

Optional pre-submit checks:

```bash
cd extension
npm run validate:release
```

AMO submission checklist: `AMO_RELEASE_CHECKLIST.md`.

## Load The Extension

1. Open Firefox and go to `about:debugging`.
2. Choose This Firefox and click Load Temporary Add-on.
3. Select `extension/manifest.json`.
4. Reload Overleaf after the extension is loaded.

## Export Flow

1. Open an Overleaf project with review comments.
2. Use the extension popup to start an export.
3. Download the generated CSV and compare it with the reference files in `samples/` when needed.

## Notes

- Build artifacts in `extension/dist/` are generated and should not be edited by hand.
- Generated CSV outputs are intentionally kept out of version control.
- Privacy policy for AMO submission: `PRIVACY.md`.
