from __future__ import annotations

import json
import math
import re
import sys
import time
import urllib.request
from pathlib import Path

from update_d1_barttorvik import (
    D1_YEAR_DIR,
    ROOT,
    USER_AGENT,
    clean_text,
    format_number,
    parse_height,
    parse_number,
)


OUT_DIR = ROOT / "data" / "vendor" / "d1_bart_splits"
MANIFEST_PATH = ROOT / "data" / "vendor" / "d1_bart_splits_manifest.js"
TOPS = {"t50": 50, "t100": 100, "t120": 120, "t220": 220}

SPLIT_MAP = {
    3: "gp",
    4: "min_per",
    5: "ortg",
    6: "usg_pct",
    7: "efg_pct",
    8: "ts_pct",
    9: "orb_pct",
    10: "drb_pct",
    11: "ast_pct",
    12: "tov_pct_adv",
    13: "ftm",
    14: "fta",
    15: "ft_pct",
    16: "two_p_made",
    17: "two_p_att",
    18: "two_p_pct",
    19: "three_p_made",
    20: "three_p_att",
    21: "three_p_pct",
    22: "blk_pct",
    23: "stl_pct",
    24: "ftr",
    28: "porpag",
    29: "adjoe",
    35: "ast_to",
    36: "rim_made",
    37: "rim_att",
    38: "mid_made",
    39: "mid_att",
    40: "rim_pct",
    41: "mid_pct",
    42: "dunk_made",
    43: "dunk_att",
    44: "dunk_pct",
    46: "drtg",
    47: "adrtg",
    48: "dporpag",
    # Match the existing D1 UI convention: bpm is Bart's game BPM and obpm/dbpm are game splits.
    53: "bpm",
    54: "mpg",
    55: "obpm",
    56: "dbpm",
    57: "orb",
    58: "drb",
    59: "trb",
    60: "ast",
    61: "stl",
    62: "blk",
    63: "pts",
    65: "three_p_per100",
}

SPLIT_COLUMNS = list(dict.fromkeys(SPLIT_MAP.values()))


def main() -> int:
    years = sorted(int(path.stem) for path in D1_YEAR_DIR.glob("*.js") if path.stem.isdigit())
    if not years:
        raise RuntimeError(f"No D1 year chunks found in {D1_YEAR_DIR}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    chunks: dict[str, dict[str, str]] = {split: {} for split in TOPS}
    for split, top in TOPS.items():
        for year in years:
            rel_path = f"data/vendor/d1_bart_splits/{split}_{year}.js"
            out_path = ROOT / rel_path
            if out_path.exists() and out_path.stat().st_size > 128:
                chunks[split][str(year)] = rel_path
                print(f"{split} {year}: already exists", flush=True)
                continue
            rows = fetch_pslice(year, top)
            records = build_records(rows)
            write_chunk(split, year, records, out_path)
            chunks[split][str(year)] = rel_path
            print(f"{split} {year}: wrote {len(records):,} rows", flush=True)
            time.sleep(0.1)
    manifest = {
        "version": "20260504",
        "columns": SPLIT_COLUMNS,
        "splits": list(TOPS.keys()),
        "years": [str(year) for year in years],
        "chunks": chunks,
    }
    MANIFEST_PATH.write_text(
        f"window.D1_BART_SPLITS_MANIFEST = {json.dumps(manifest, separators=(',', ':'))};\n",
        encoding="utf-8",
    )
    print(f"manifest: {MANIFEST_PATH}", flush=True)
    return 0


def fetch_pslice(year: int, top: int) -> list:
    url = f"https://barttorvik.com/pslice.php?year={year}&top={top}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Referer": "https://barttorvik.com/playerstat.php"})
    with urllib.request.urlopen(request, timeout=180) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, list):
        raise ValueError(f"Unexpected pslice payload for {year} top {top}")
    return payload


def build_records(rows: list) -> dict[str, list[float | int | None]]:
    records: dict[str, list[float | int | None]] = {}
    for row in rows:
        if not isinstance(row, list) or len(row) < 64:
            continue
        pid = clean_text(row[32] if len(row) > 32 else "")
        if not pid:
            continue
        values_by_column: dict[str, float | int | None] = {}
        for index, column in SPLIT_MAP.items():
            value = normalize_value(column, row[index] if index < len(row) else None)
            values_by_column[column] = value
        records[pid] = [values_by_column.get(column) for column in SPLIT_COLUMNS]
    return records


def normalize_value(column: str, value: object) -> float | int | None:
    if value is None or value == "":
        return None
    if column == "height_in":
        number = parse_height(value)
    else:
        number = parse_number(value)
    if number is None or not math.isfinite(number):
        return None
    rounded = float(format_number(number))
    if abs(rounded - round(rounded)) < 1e-9:
        return int(round(rounded))
    return rounded


def write_chunk(split: str, year: int, records: dict[str, list[float | int | None]], path: Path) -> None:
    path.write_text(
        "\n".join([
            "window.D1_BART_SPLIT_CHUNKS = window.D1_BART_SPLIT_CHUNKS || {};",
            f"window.D1_BART_SPLIT_CHUNKS[{json.dumps(split)}] = window.D1_BART_SPLIT_CHUNKS[{json.dumps(split)}] || {{}};",
            f"window.D1_BART_SPLIT_CHUNKS[{json.dumps(split)}][{json.dumps(str(year))}] = {json.dumps(records, separators=(',', ':'))};",
            "",
        ]),
        encoding="utf-8",
    )


if __name__ == "__main__":
    sys.exit(main())
