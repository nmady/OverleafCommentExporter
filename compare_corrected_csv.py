#!/usr/bin/env python3
"""Compare an exported Overleaf comments CSV against a corrected baseline.

Usage:
    python3 compare_corrected_csv.py \
      --export overleaf-comments-2026-05-22.csv \
      --corrected overleaf-comments-corrected.csv
"""

from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

Key = Tuple[str, str]


def read_csv_rows(path: Path) -> List[Dict[str, str]]:
  last_error: Exception | None = None
  for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
    try:
      with path.open("r", encoding=encoding, newline="") as f:
        reader = csv.DictReader(f)
        return [dict(r) for r in reader]
    except Exception as exc:  # pragma: no cover - best effort fallback logic
      last_error = exc
  raise RuntimeError(f"Failed to read {path}: {last_error}")


def normalize_text(text: str) -> str:
  return re.sub(r"\s+", " ", (text or "")).strip().lower()


def row_key(row: Dict[str, str]) -> Key:
  return (row.get("Thread ID", "").strip(), row.get("Reply #", "").strip())


def parse_debug_field(debug: str) -> Dict[str, str]:
  parsed: Dict[str, str] = {}
  if not debug:
    return parsed

  for chunk in debug.split(" | "):
    if "=" not in chunk:
      continue
    k, v = chunk.split("=", 1)
    parsed[k.strip()] = v.strip()
  return parsed


def summarize_sources(rows: Iterable[Dict[str, str]]) -> Counter[str]:
  counter: Counter[str] = Counter()
  for row in rows:
    dbg = parse_debug_field(row.get("Debug", ""))
    src = dbg.get("source", "(missing)")
    confidence = dbg.get("confidence", "(missing)")
    counter[f"{src} | confidence={confidence}"] += 1
  return counter


def main() -> None:
  parser = argparse.ArgumentParser(description="Compare exported CSV against corrected baseline")
  parser.add_argument("--export", required=True, type=Path, help="Extractor output CSV")
  parser.add_argument("--corrected", required=True, type=Path, help="Corrected baseline CSV")
  args = parser.parse_args()

  export_rows = read_csv_rows(args.export)
  corrected_rows = read_csv_rows(args.corrected)

  export_by_key: Dict[Key, Dict[str, str]] = {row_key(r): r for r in export_rows}
  corrected_by_key: Dict[Key, Dict[str, str]] = {row_key(r): r for r in corrected_rows}

  export_keys = set(export_by_key.keys())
  corrected_keys = set(corrected_by_key.keys())
  overlap_keys = sorted(export_keys & corrected_keys)

  char_pos_matches = 0
  char_pos_total = 0
  highlight_matches = 0
  highlight_total = 0

  for key in overlap_keys:
    export_row = export_by_key[key]
    corrected_row = corrected_by_key[key]

    export_pos = (export_row.get("Char Position", "") or "").strip()
    corrected_pos = (corrected_row.get("Char Position", "") or "").strip()
    if export_pos and corrected_pos:
      char_pos_total += 1
      if export_pos == corrected_pos:
        char_pos_matches += 1

    export_highlight = normalize_text(export_row.get("Highlighted Text", ""))
    corrected_highlight = normalize_text(corrected_row.get("Highlighted Text", ""))
    if export_highlight or corrected_highlight:
      highlight_total += 1
      if export_highlight == corrected_highlight:
        highlight_matches += 1

  print("=== CSV Comparison Report ===")
  print(f"export_rows: {len(export_rows)}")
  print(f"corrected_rows: {len(corrected_rows)}")
  print(f"overlap_rows: {len(overlap_keys)}")
  print(f"export_only_rows: {len(export_keys - corrected_keys)}")
  print(f"corrected_only_rows: {len(corrected_keys - export_keys)}")

  if char_pos_total:
    rate = (char_pos_matches / char_pos_total) * 100
    print(f"char_pos_match_rate: {char_pos_matches}/{char_pos_total} ({rate:.2f}%)")
  else:
    print("char_pos_match_rate: n/a (no overlapping non-empty char positions)")

  if highlight_total:
    rate = (highlight_matches / highlight_total) * 100
    print(f"normalized_highlight_match_rate: {highlight_matches}/{highlight_total} ({rate:.2f}%)")
  else:
    print("normalized_highlight_match_rate: n/a (no overlapping highlight values)")

  print("\n=== Source/Confidence Distribution (export rows) ===")
  source_counts = summarize_sources(export_rows)
  for label, count in source_counts.most_common():
    print(f"{label}: {count}")


if __name__ == "__main__":
  main()
