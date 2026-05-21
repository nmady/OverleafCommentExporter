# Overleaf Comment Scraper

Tools for extracting and analyzing Overleaf review comments.

## Project Structure

- `scraper.py`: Python scraper/exporter for comment data.
- `analyzer.py`: Analysis utilities for exported comment data.
- `extension/`: Browser extension for exporting comments from Overleaf.

## Setup

### Python tools

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Browser extension

```bash
cd extension
npm install
npm run build
```

Load the extension from the `extension/` folder (and ensure `dist/` has been built).

## GitHub

This repository is set up to ignore generated CSV/XLSX outputs and build artifacts by default.
