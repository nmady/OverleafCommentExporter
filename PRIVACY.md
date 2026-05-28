# Privacy Policy

## Overleaf Comment Exporter

Last updated: 2026-05-28

Overleaf Comment Exporter processes data locally in your browser to help you export Overleaf review comments.

## What data the extension accesses

- Overleaf project page content needed to read review comments.
- Comment metadata visible in Overleaf, such as comment text, usernames, and timestamps.
- Highlight/context text associated with comment threads.

## How data is used

- Data is used only to generate downloadable exports (CSV/XLSX) requested by you.
- Processing occurs locally in your browser tab.
- The extension does not send extracted data to external servers.

## Data storage and retention

- Export files are saved only when you choose to download them.
- The extension does not maintain a remote database.
- The extension does not intentionally store your Overleaf comment data outside the generated files.

## Data sharing

- No sale of personal data.
- No third-party analytics or advertising SDKs are included.
- No sharing of extracted comment data with external services.

## Permissions rationale

- `activeTab`: required to run extraction on the active Overleaf tab when you trigger an export.
- `https://www.overleaf.com/*`: required so the content script can access Overleaf pages.

## Your controls

- You can uninstall the extension at any time.
- You can delete generated export files from your device at any time.

## Contact

Project repository: https://github.com/nmady/OverleafCommentExporter
