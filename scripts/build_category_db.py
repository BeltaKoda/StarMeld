#!/usr/bin/env python3
"""
Build and validate the key-to-category mapping for StarMeld.

Reads a stock global.ini and classifies every key using the regex rules
from data/categories.json. Outputs a pre-built category_db.json for the
web app's Category Browser tab and reports any keys landing in "Other"
for review.

Usage:
    python scripts/build_category_db.py [path_to_stock_global.ini]

If no path is given, defaults to:
    ../ScCompLangPackRemix/LIVE/stock-global.ini
"""

import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
CATEGORIES_JSON = REPO_ROOT / "data" / "categories.json"
OUTPUT_JSON = REPO_ROOT / "data" / "category_db.json"

DEFAULT_STOCK_PATH = REPO_ROOT.parent / "ScCompLangPackRemix" / "LIVE" / "stock-global.ini"


def read_ini(path: Path) -> dict[str, str]:
    """Read a global.ini file into a dict of key=value pairs."""
    entries = {}
    with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
        for line in f:
            line = line.rstrip("\n\r")
            trimmed_start = line.lstrip()
            if "=" in line and not trimmed_start.startswith(";"):
                key, value = line.split("=", 1)
                entries[key.strip()] = value
    return entries


def load_rules(json_path: Path):
    """Load categories.json and compile regex patterns."""
    with open(json_path, "r") as f:
        data = json.load(f)

    rules = []
    for group in data["groups"]:
        for category in group["categories"]:
            for pattern in category["patterns"]:
                rules.append({
                    "regex": re.compile(pattern),
                    "category": category["name"],
                    "group": group["name"],
                })

    catch_all = data.get("catchAll", "Other")
    return rules, catch_all, data["groups"]


def classify(key: str, rules: list, catch_all: str) -> tuple[str, str]:
    """Classify a key. Returns (category, group)."""
    for rule in rules:
        if rule["regex"].search(key):
            return rule["category"], rule["group"]
    return catch_all, catch_all


def main():
    # Determine stock file path
    if len(sys.argv) > 1:
        stock_path = Path(sys.argv[1])
    else:
        stock_path = DEFAULT_STOCK_PATH

    if not stock_path.exists():
        print(f"Error: Stock file not found: {stock_path}", file=sys.stderr)
        print(f"Usage: python {sys.argv[0]} [path_to_stock_global.ini]", file=sys.stderr)
        sys.exit(1)

    if not CATEGORIES_JSON.exists():
        print(f"Error: categories.json not found: {CATEGORIES_JSON}", file=sys.stderr)
        sys.exit(1)

    # Load
    print(f"Reading stock INI: {stock_path}")
    stock = read_ini(stock_path)
    print(f"  {len(stock)} keys loaded")

    print(f"Loading category rules: {CATEGORIES_JSON}")
    rules, catch_all, groups = load_rules(CATEGORIES_JSON)
    print(f"  {len(rules)} regex rules compiled")

    # Classify all keys
    print("Classifying keys...")
    db = {}
    category_counts = {}
    other_keys = []

    for key in sorted(stock.keys()):
        category, group = classify(key, rules, catch_all)
        db[key] = {"category": category, "group": group}
        category_counts[category] = category_counts.get(category, 0) + 1
        if category == catch_all:
            other_keys.append(key)

    # Output the DB
    output = {
        "totalKeys": len(db),
        "generatedFrom": str(stock_path.name),
        "keys": db
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, separators=(",", ":"))

    print(f"\nWrote {len(db)} keys to {OUTPUT_JSON}")
    file_size_mb = OUTPUT_JSON.stat().st_size / (1024 * 1024)
    print(f"  File size: {file_size_mb:.1f} MB")

    # Summary by category
    print("\n--- Category Summary ---")
    for group in groups:
        group_total = 0
        for cat in group["categories"]:
            count = category_counts.get(cat["name"], 0)
            group_total += count
            print(f"  {group['name']:20s} > {cat['name']:25s}: {count:6d}")
        print(f"  {'':20s}   {'SUBTOTAL':25s}: {group_total:6d}")
        print()

    other_count = category_counts.get(catch_all, 0)
    print(f"  {'':20s}   {catch_all:25s}: {other_count:6d}")
    print(f"\n  {'':20s}   {'TOTAL':25s}: {len(db):6d}")

    # Report "Other" keys
    if other_keys:
        print(f"\n--- {len(other_keys)} keys in '{catch_all}' (review for new categories) ---",
              file=sys.stderr)
        # Group by prefix for easier review
        prefix_groups = {}
        for key in other_keys:
            prefix = key.split("_")[0] if "_" in key else key
            prefix_groups.setdefault(prefix, []).append(key)

        for prefix in sorted(prefix_groups.keys(), key=lambda p: -len(prefix_groups[p])):
            keys = prefix_groups[prefix]
            print(f"  {prefix}_ ({len(keys)} keys):", file=sys.stderr)
            for k in keys[:5]:
                print(f"    {k}", file=sys.stderr)
            if len(keys) > 5:
                print(f"    ... and {len(keys) - 5} more", file=sys.stderr)
    else:
        print("\nAll keys classified! No keys in 'Other'.", file=sys.stderr)


if __name__ == "__main__":
    main()
