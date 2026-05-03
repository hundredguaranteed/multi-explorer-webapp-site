from __future__ import annotations

import csv
import gc
import io
import json
import math
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
D1_PARTS_DIR = ROOT / "data" / "vendor" / "d1_enriched_all_seasons_parts"
D1_MANIFEST = ROOT / "data" / "vendor" / "d1_enriched_all_seasons_manifest.js"
D1_YEAR_DIR = ROOT / "data" / "vendor" / "d1_year_chunks"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
csv.field_size_limit(1024 * 1024 * 1024)
gc.disable()

ADVANCED_MAP = {
    2: "conference",
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
    25: "class_year",
    26: "height_in",
    28: "porpag",
    29: "adjoe",
}

FULL_MAP = {
    33: "hometown",
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
    45: "draft_pick",
    46: "drtg",
    47: "adrtg",
    48: "dporpag",
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
    66: "dob",
}

PERCENT_RATIO_COLUMNS = {"ft_pct", "two_p_pct", "three_p_pct", "rim_pct", "mid_pct", "dunk_pct"}


def main() -> int:
    years = sorted(int(path.stem) for path in D1_YEAR_DIR.glob("*.js") if path.stem.isdigit())
    total_rows = 0
    total_updated = 0
    for year in years:
        advanced = fetch_json(f"https://barttorvik.com/{year}_advanced_player_stats.json")
        full = fetch_full_advstats(year)
        sources = {year: build_source_index(year, advanced, full)}
        print(f"{year}: loaded {len(sources[year]):,} Bart rows")
        path = D1_YEAR_DIR / f"{year}.js"
        rows = read_year_chunk(path)
        summary = apply_sources(rows, sources)
        total_rows += summary["rows"]
        total_updated += summary["updated"]
        write_year_chunk(year, rows, path)
        print(f"d1-year-{year}: updated {summary['updated']:,}/{summary['rows']:,} rows")
        del advanced, full, sources, rows
    write_full_from_year_chunks(years)
    print(f"d1-full: wrote {total_rows:,} rows from updated year chunks ({total_updated:,} year-row updates)")
    return 0


def fetch_json(url: str) -> list:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Referer": "https://barttorvik.com/playerstat.php"})
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, list):
        raise ValueError(f"Unexpected JSON payload from {url}")
    return payload


def fetch_full_advstats(year: int) -> list:
    start = f"{year - 1}1101"
    end = f"{year}0501"
    query = urllib.parse.urlencode({
        "year": year,
        "specialSource": "",
        "conyes": 0,
        "start": start,
        "end": end,
        "top": 365,
        "xvalue": "All",
        "page": "playerstat",
        "team": "All",
    })
    return fetch_json(f"https://barttorvik.com/getadvstats.php?{query}")


def build_source_index(year: int, advanced_rows: list, full_rows: list) -> dict[str, dict[str, str]]:
    by_key: dict[str, dict[str, str]] = {}
    for row in advanced_rows:
        record = source_record_from_row(row, year, ADVANCED_MAP)
        if record:
            by_key[record["_key"]] = record
    for row in full_rows:
        record = source_record_from_row(row, year, {**ADVANCED_MAP, **FULL_MAP})
        if not record:
            continue
        existing = by_key.get(record["_key"], {})
        existing.update({key: value for key, value in record.items() if value != ""})
        by_key[record["_key"]] = existing
    return by_key


def source_record_from_row(row: object, year: int, index_map: dict[int, str]) -> dict[str, str]:
    if not isinstance(row, list) or len(row) < 3:
        return {}
    player = clean_text(row[0])
    team = clean_text(row[1])
    if not player or not team:
        return {}
    record = {
        "_key": source_key(year, player, team),
        "_player_key": normalize_name(player),
        "_team_key": normalize_team(team),
    }
    for index, column in index_map.items():
        if index >= len(row):
            continue
        value = normalize_source_value(column, row[index])
        if value != "":
            record[column] = value
    if "rim_made" in record and "rim_att" in record:
        record["rim_pct"] = format_number(percent(record["rim_made"], record["rim_att"]))
    if "mid_made" in record and "mid_att" in record:
        record["mid_pct"] = format_number(percent(record["mid_made"], record["mid_att"]))
    if "dunk_made" in record and "dunk_att" in record:
        record["dunk_pct"] = format_number(percent(record["dunk_made"], record["dunk_att"]))
    gp = parse_number(record.get("gp"))
    mpg = parse_number(record.get("mpg"))
    if gp and mpg:
        record["min"] = format_number(gp * mpg)
    return record


def normalize_source_value(column: str, value: object) -> str:
    if value is None:
        return ""
    if column == "height_in":
        parsed = parse_height(value)
        return format_number(parsed) if parsed is not None else ""
    if column == "class_year":
        return normalize_class(value)
    if column == "draft_pick":
        number = parse_number(value)
        return "" if number is None or number <= 0 else format_number(number)
    if column in {"conference", "hometown", "dob"}:
        return clean_text(value)
    number = parse_number(value)
    if number is None:
        return clean_text(value)
    if column in PERCENT_RATIO_COLUMNS and abs(number) <= 1.5:
        return format_number(number)
    return format_number(number)


def apply_sources(rows: list[dict[str, str]], sources: dict[int, dict[str, dict[str, str]]]) -> dict[str, int]:
    player_fallback: dict[tuple[int, str], list[dict[str, str]]] = defaultdict(list)
    for year, year_sources in sources.items():
        for source in year_sources.values():
            player_fallback[(year, source["_player_key"])].append(source)

    updated = 0
    for row in rows:
        year = season_end(row.get("season"))
        if year is None or year not in sources:
            continue
        keys = row_source_keys(year, row)
        source = next((sources[year].get(key) for key in keys if key in sources[year]), None)
        if source is None:
            candidates = player_fallback.get((year, normalize_name(row.get("player_name") or row.get("player"))), [])
            source = choose_by_team(row, candidates)
        if source is None:
            continue
        if apply_source_to_row(row, source):
            updated += 1
    return {"rows": len(rows), "updated": updated}


def choose_by_team(row: dict[str, str], candidates: list[dict[str, str]]) -> dict[str, str] | None:
    if not candidates:
        return None
    row_teams = {normalize_team(row.get("team_name")), normalize_team(row.get("team_full"))}
    for source in candidates:
        if source.get("_team_key") in row_teams:
            return source
    return candidates[0] if len(candidates) == 1 else None


def apply_source_to_row(row: dict[str, str], source: dict[str, str]) -> bool:
    changed = False
    for column, value in source.items():
        if column.startswith("_") or value == "":
            continue
        if row.get(column) != value:
            row[column] = value
            changed = True
    return changed


def row_source_keys(year: int, row: dict[str, str]) -> list[str]:
    player = row.get("player_name") or row.get("player")
    teams = [row.get("team_name"), row.get("team_full")]
    return [source_key(year, player, team) for team in teams if clean_text(team)]


def source_key(year: int, player: object, team: object) -> str:
    return f"{year}|{normalize_name(player)}|{normalize_team(team)}"


def season_end(value: object) -> int | None:
    text = clean_text(value)
    if not text:
        return None
    match = re.search(r"\d{4}", text)
    if not match:
        return None
    if "-" in text:
        return int(match.group(0)) + 1
    return int(match.group(0))


def read_year_chunk(path: Path) -> list[dict[str, str]]:
    text = read_year_chunk_text(path)
    return parse_csv_rows(text)


def read_year_chunk_text(path: Path) -> str:
    line = path.read_text(encoding="utf-8").strip().splitlines()[-1]
    return json.loads(line.split("=", 1)[1].strip().rstrip(";"))


def read_multipart_csv(parts_dir: Path) -> list[dict[str, str]]:
    chunks = []
    for path in sorted(parts_dir.glob("part-*.js")):
        line = path.read_text(encoding="utf-8").strip()
        chunks.append(json.loads(line.split("+", 1)[1].strip().rstrip(";")))
    return parse_csv_rows("".join(chunks))


def parse_csv_rows(text: str) -> list[dict[str, str]]:
    return [dict(row) for row in csv.DictReader(io.StringIO(text))]


def rows_to_csv_text(rows: list[dict[str, str]]) -> str:
    fieldnames = collect_columns(rows)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator="\n", extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({column: row.get(column, "") for column in fieldnames})
    return output.getvalue()


def collect_columns(rows: list[dict[str, str]]) -> list[str]:
    columns: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for column in row:
            if column and column not in seen:
                seen.add(column)
                columns.append(column)
    return columns


def write_year_chunk(year: int, rows: list[dict[str, str]], path: Path) -> None:
    text = rows_to_csv_text(rows)
    path.write_text(
        "window.D1_YEAR_CSV_CHUNKS = window.D1_YEAR_CSV_CHUNKS || {};\n"
        f"window.D1_YEAR_CSV_CHUNKS[{json.dumps(str(year))}] = {json.dumps(text, ensure_ascii=True)};\n",
        encoding="utf-8",
    )


def write_multipart_csv(rows: list[dict[str, str]], parts_dir: Path, manifest_path: Path, max_chars: int = 3_500_000) -> None:
    text = rows_to_csv_text(rows)
    write_multipart_text(text, parts_dir, manifest_path, max_chars=max_chars)


def write_full_from_year_chunks(years: list[int]) -> None:
    chunks: list[str] = []
    header = ""
    for year in years:
        text = read_year_chunk_text(D1_YEAR_DIR / f"{year}.js")
        if not text:
            continue
        first_line_end = text.find("\n")
        if first_line_end < 0:
            continue
        year_header = text[:first_line_end + 1]
        body = text[first_line_end + 1 :]
        if not header:
            header = year_header
            chunks.append(header)
        chunks.append(body)
    write_multipart_text("".join(chunks), D1_PARTS_DIR, D1_MANIFEST)


def write_multipart_text(text: str, parts_dir: Path, manifest_path: Path, max_chars: int = 3_500_000) -> None:
    chunks = split_csv_text(text, max_chars=max_chars)
    for path in parts_dir.glob("part-*.js"):
        path.unlink()
    part_names = []
    for index, chunk in enumerate(chunks, start=1):
        name = f"part-{index:03d}"
        part_names.append(name)
        (parts_dir / f"{name}.js").write_text(
            f"window.D1_ENRICHED_ALL_CSV = (window.D1_ENRICHED_ALL_CSV || \"\") + {json.dumps(chunk, ensure_ascii=True)};\n",
            encoding="utf-8",
        )
    manifest_path.write_text(f"window.D1_ENRICHED_ALL_SEASONS_PARTS = {json.dumps(part_names)};\n", encoding="utf-8")


def split_csv_text(text: str, max_chars: int) -> list[str]:
    chunks = []
    remaining = text
    while len(remaining) > max_chars:
        split_at = remaining.rfind("\n", 0, max_chars)
        if split_at <= 0:
            split_at = max_chars
        chunks.append(remaining[: split_at + 1])
        remaining = remaining[split_at + 1 :]
    if remaining:
        chunks.append(remaining)
    return chunks


def parse_number(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value) if math.isfinite(float(value)) else None
    text = clean_text(value).replace(",", "").replace("%", "")
    if not text:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def percent(made: object, attempts: object) -> float | None:
    made_number = parse_number(made)
    attempts_number = parse_number(attempts)
    if made_number is None or attempts_number is None or attempts_number <= 0:
        return None
    return made_number / attempts_number


def format_number(value: object) -> str:
    number = parse_number(value)
    if number is None:
        return clean_text(value)
    rounded = round(number, 6)
    if abs(rounded - round(rounded)) < 1e-9:
        return str(int(round(rounded)))
    return f"{rounded:.6f}".rstrip("0").rstrip(".")


def parse_height(value: object) -> float | None:
    text = clean_text(value)
    match = re.match(r"^(\d+)\s*[-']\s*(\d+)", text)
    if not match:
        return parse_number(value)
    return float(int(match.group(1)) * 12 + int(match.group(2)))


def normalize_class(value: object) -> str:
    text = clean_text(value)
    lookup = {
        "freshman": "Fr",
        "sophomore": "So",
        "junior": "Jr",
        "senior": "Sr",
        "graduate": "Gr",
    }
    return lookup.get(text.lower(), text)


def clean_text(value: object) -> str:
    return "" if value is None else str(value).strip()


def normalize_ascii(value: object) -> str:
    text = unicodedata.normalize("NFKD", clean_text(value))
    return "".join(char for char in text if not unicodedata.combining(char))


def normalize_name(value: object) -> str:
    text = normalize_ascii(value).lower()
    text = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_team(value: object) -> str:
    text = normalize_ascii(value).lower()
    text = text.replace("&", " and ")
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"\bsaint\b", "st", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


if __name__ == "__main__":
    sys.exit(main())
