# AMO Release Checklist

Use this checklist before each addons.mozilla.org submission.

## 1. Build and Validate

Run from `extension/`:

```bash
npm install
npm run validate:release
```

Expected outcomes:

- `dist/content.js` and `dist/popup.js` are rebuilt.
- `web-ext lint` completes without errors.
- `web-ext-artifacts/overleaf-comment-exporter-<version>.zip` is generated.

## 2. Manifest and Metadata

- Confirm `version` is updated in `extension/manifest.json`.
- Confirm `browser_specific_settings.gecko.id` is stable and unchanged.
- Confirm `icons` paths exist for 16, 48, 96, and 128 px files.
- Confirm `homepage_url` points to the project repository.

## 3. AMO Listing Assets

- Provide at least 2 screenshots in the AMO listing form.
- Verify screenshots avoid private project content.
- Use `PRIVACY.md` as the policy source for listing text.

## 4. Functional Smoke Test in Firefox

1. Open `about:debugging` and load temporary add-on from `extension/manifest.json`.
2. Open an Overleaf project with review comments.
3. Run CSV export and verify output opens correctly.
4. Run XLSX export and verify output opens correctly.

## 5. Submission

- Upload generated zip from `extension/web-ext-artifacts/` to AMO.
- Fill listing summary, screenshots, and privacy policy link.
- Add release notes for the submitted version.
