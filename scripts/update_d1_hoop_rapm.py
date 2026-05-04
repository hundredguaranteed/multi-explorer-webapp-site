from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

from update_d1_barttorvik import (
    D1_YEAR_DIR,
    ROOT,
    clean_text,
    format_number,
    normalize_name,
    normalize_team,
    parse_number,
    read_year_chunk,
    write_full_from_year_chunks,
    write_year_chunk,
)


SOURCE_DIR = ROOT.parent / "hoop_explorer_players_all_2018plus" / "enrichedPlayers"
SOURCE_PATTERN = "players_all_Men_*_High.json"
RAPM_COLUMNS = {
    "he_o_rapm": "off_adj_rapm",
    "he_d_rapm": "def_adj_rapm",
    "he_rapm_off_adj_ppp": "rapm.off_adj_ppp",
    "he_rapm_def_adj_ppp": "rapm.def_adj_ppp",
    "he_rapm_off_efg": "rapm.off_efg",
    "he_rapm_def_efg": "rapm.def_efg",
    "he_rapm_off_to": "rapm.off_to",
    "he_rapm_def_to": "rapm.def_to",
    "he_rapm_off_orb": "rapm.off_orb",
    "he_rapm_def_orb": "rapm.def_orb",
    "he_rapm_off_ftr": "rapm.off_ftr",
    "he_rapm_def_ftr": "rapm.def_ftr",
}


def main() -> int:
    rapm_index = build_rapm_index()
    years = sorted(int(path.stem) for path in D1_YEAR_DIR.glob("*.js") if path.stem.isdigit())
    total_updated = 0
    for year in years:
        path = D1_YEAR_DIR / f"{year}.js"
        rows = read_year_chunk(path)
        updated = apply_rapm(rows, rapm_index.get(year, {}))
        write_year_chunk(year, rows, path)
        total_updated += updated
        print(f"d1-hoop-rapm {year}: updated {updated:,}/{len(rows):,}")
    write_full_from_year_chunks(years)
    print(f"d1-hoop-rapm full: updated {total_updated:,} rows")
    return 0


def build_rapm_index() -> dict[int, dict[str, dict[str, str]]]:
    index: dict[int, dict[str, dict[str, str]]] = {}
    for path in sorted(SOURCE_DIR.glob(SOURCE_PATTERN)):
        match = re.search(r"Men_(\d{4})_High", path.name)
        if not match:
            continue
        season = int(match.group(1)) + 1
        payload = json.loads(path.read_text(encoding="utf-8"))
        players = payload.get("players") if isinstance(payload, dict) else []
        if not isinstance(players, list):
            continue
        year_index: dict[str, dict[str, str]] = {}
        for player in players:
            record = flatten_player(player)
            if not record:
                continue
            player_key = normalize_hoop_name(player.get("key"))
            team_key = normalize_team(player.get("team"))
            if player_key and team_key:
                year_index[f"{player_key}|{team_key}"] = record
        index[season] = year_index
        print(f"loaded Hoop Explorer {season}: {len(year_index):,} rows")
    return index


def flatten_player(player: dict) -> dict[str, str]:
    if not isinstance(player, dict):
        return {}
    record: dict[str, str] = {}
    off = parse_number(extract_value(player, "off_adj_rapm"))
    defense = parse_number(extract_value(player, "def_adj_rapm"))
    if off is not None and defense is not None:
        # Hoop Explorer's defensive RAPM is negative when the defense is better.
        record["he_rapm"] = format_number(off - defense)
    for target, source in RAPM_COLUMNS.items():
        value = parse_number(extract_path(player, source))
        if value is not None and math.isfinite(value):
            record[target] = format_number(value)
    return record


def extract_path(player: dict, source: str):
    value = player
    for part in source.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return extract_value({"value": value}, "value")


def extract_value(obj: object, key: str):
    if not isinstance(obj, dict):
        return None
    value = obj.get(key)
    if isinstance(value, dict):
        return value.get("value")
    return value


def normalize_hoop_name(value: object) -> str:
    text = clean_text(value)
    if "," in text:
        last, first = [part.strip() for part in text.split(",", 1)]
        text = f"{first} {last}".strip()
    return normalize_name(text)


def apply_rapm(rows: list[dict[str, str]], year_index: dict[str, dict[str, str]]) -> int:
    if not year_index:
        return 0
    updated = 0
    for row in rows:
        key = f"{normalize_name(row.get('player_name') or row.get('player'))}|{normalize_team(row.get('team_name') or row.get('team_full'))}"
        record = year_index.get(key)
        if record is None:
            continue
        changed = False
        for column in ["he_rapm", *RAPM_COLUMNS.keys()]:
            value = record.get(column, "")
            if value and row.get(column) != value:
                row[column] = value
                changed = True
        if changed:
            updated += 1
    return updated


if __name__ == "__main__":
    sys.exit(main())
