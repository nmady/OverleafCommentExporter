# FAQ

## What does this extension export?

It exports Overleaf review comments into CSV or XLSX with metadata, highlighted text, context, and position when available.

## Do I need to open the Review panel first?

Yes. Keep the Overleaf Review panel open before starting export so comment entries are available to the content script.

## Does it send my manuscript or comments to a server?

No. Extraction and file generation happen locally in your browser.

## Why are some highlights imperfect or missing?

Overleaf editor highlights are dynamic and may not always expose a single canonical mapping. The extractor uses multiple fallback strategies to return the best available text.

## Why is Char Position sometimes empty?

Some comment entries do not expose a reliable position in the current UI state. In those cases the field is left empty instead of using speculative values.

## Why are exports missing some comments?

Overleaf may virtualize long review lists. Ensure the Review panel is open and re-run export if needed.

## How do I test a change before release?

Follow [TESTING.md](TESTING.md) and run the release checks listed in [AMO_RELEASE_CHECKLIST.md](AMO_RELEASE_CHECKLIST.md).

## Where should I report bugs?

Use the project issue tracker at https://github.com/nmady/OverleafCommentExporter and include browser version, reproduction steps, and redacted evidence.
