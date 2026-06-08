# Overleaf Comment Exporter

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.20513057.svg)](https://doi.org/10.5281/zenodo.20513057)

A Firefox add-on designed to streamline collaborative academic writing by easily extracting and organizing comments from Overleaf projects. 

Firefox Add-ons page: https://addons.mozilla.org/en-US/firefox/addon/overleaf-comment-exporter/

Managing feedback across multi-author manuscripts can be a high-friction process. Developed within the **[Autotelic Interaction Research Group](https://www.aalto.fi/en/department-of-computer-science/autotelic-interaction-research)** at **Aalto University**, this tool emerged from the practical need to simplify complex writing workflows in our own research on self-directed behavior. In Overleaf, the highlighted text referenced by a comment is often lost during edits, so it is helpful to be able to return to  a spreadsheet snapshot of the original highlights. We've also found that moving comments to a spreadsheet allows us to more easily organize the work to address them. By reducing the administrative overhead of addressing co-author feedback, this extension allows researchers to focus more on communicating their science and less on worrying about lost comments. 

## Table of Contents

- [System Requirements](#system-requirements)
- [Install and Quick Start](#install-and-quick-start)
- [Export Output Schema](#export-output-schema)
- [Known Limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Developer Workflow](#developer-workflow)
- [Project Documentation](#project-documentation)
- [Privacy and Data Handling](#privacy-and-data-handling)
- [Acknowledgments and Funding](#acknowledgments-and-funding)
- [Citation](#citation)
- [License](#license)

## System Requirements

- Firefox 140.0 or newer.
- Access to https://www.overleaf.com/ with a project that has review comments.
- For local development only:
	- Node.js 20+ (recommended).
	- npm 10+ (recommended).

## Install and Quick Start

### Install from AMO (recommended)

1. Visit the Firefox Add-ons page and click Add to Firefox.
2. Open an Overleaf project.
3. Open the Review panel in Overleaf.
4. Open the extension popup from the Firefox extensions menu.
5. Export as CSV or XLSX.

### Load temporary add-on for development

1. Open Firefox and navigate to about:debugging.
2. Select This Firefox.
3. Click Load Temporary Add-on.
4. Choose [extension/manifest.json](extension/manifest.json).
5. Reload the active Overleaf tab.

![Choose CSV or XLSX export in the extension popup.](https://github.com/nmady/OverleafCommentExporter/raw/main/extension/screenshots/Screenshot%202026-05-29%20at%2011.49.58%E2%80%AFAM.png)
![Example XLSX output in spreadsheet software.](https://github.com/nmady/OverleafCommentExporter/blob/main/extension/screenshots/Screenshot%202026-05-29%20at%2011.52.26%E2%80%AFAM.png)


## Developer Notes 

### What’s Here

- `extension/`: the Firefox-compatible browser extension.

### Build from source

```bash
cd extension
npm install
npm run build
```

### Package For addons.mozilla.org (AMO)

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

### Load The Extension

1. Open Firefox and go to `about:debugging`.
2. Choose This Firefox and click Load Temporary Add-on.
3. Select `extension/manifest.json`.
4. Reload Overleaf after the extension is loaded.

### Export Flow

1. Open an Overleaf project with review comments.
2. Use the extension popup to start an export.
3. Download the generated CSV and compare it with the reference files in `samples/` when needed.

### Notes

- Build artifacts in `extension/dist/` are generated and should not be edited by hand.
- Generated CSV outputs are intentionally kept out of version control.
- Privacy policy for AMO submission: `PRIVACY.md`.

## Acknowledgments & Funding
This software is maintained by the **[Autotelic Interaction Research Group](https://www.aalto.fi/en/department-of-computer-science/autotelic-interaction-research)** and its development is generously supported by the **[Helsinki Institute for Information Technology (HIIT)](https://www.hiit.fi/)**.

## Citation
If you use this tool to assist in your academic writing or research workflow, please consider citing it:

> Ady, Nadia M. (2026). *Overleaf Comment Extractor* (Version 0.1.0) [Browser Extension]. Zenodo. doi:10.5281/zenodo.20513057 

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).