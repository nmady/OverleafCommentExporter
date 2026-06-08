# Contributing

Thank you for contributing to Overleaf Comment Exporter.

## Scope and Principles

- Prioritize correctness and reproducibility over feature volume.
- Keep behavior changes separate from readability/documentation changes.
- Preserve extracted text exactly as rendered by Overleaf. Avoid whitespace normalization in export fields.
- Keep Firefox and AMO compatibility in mind for all changes.

## Development Setup

1. Install Node.js 20+ and npm 10+.
2. Run:

```bash
cd extension
npm install
npm run build
```

3. Load the extension temporarily in Firefox using about:debugging and [extension/manifest.json](extension/manifest.json).

## Branch and Commit Guidance

- Use focused branches for one concern at a time (docs, refactor, bugfix).
- Write clear commit messages that explain intent and user impact.
- Keep pull requests small enough for targeted review.

## Pull Request Checklist

Before opening a PR:

1. Run release validation:

```bash
cd extension
npm run validate:release
```

2. Confirm exports still produce valid CSV and XLSX.
3. Update [CHANGELOG.md](CHANGELOG.md) when behavior or user-visible documentation changes.
4. Update [README.md](README.md) and [FAQ.md](FAQ.md) if usage expectations changed.
5. If privacy behavior changed, update [PRIVACY.md](PRIVACY.md).

## Code Style and Readability

- TypeScript strict mode is required.
- Add comments where logic is non-obvious, especially in multi-step fallback or matching code.
- Favor naming clarity over abbreviation.
- Do not hand-edit generated build output in extension/dist.

## Testing Expectations

- Follow [TESTING.md](TESTING.md) for both scripted checks and manual Firefox smoke tests.
- For extraction changes, test on an Overleaf project with multiple threads and replies.

## Reporting Issues

When filing an issue, include:

- Browser version.
- Whether extension is AMO-installed or temporary-loaded.
- Steps to reproduce.
- Expected result and observed result.
- Redacted screenshots or sample outputs when possible.
