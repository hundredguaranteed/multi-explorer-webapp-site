from __future__ import annotations

import csv
import difflib
import io
import json
import math
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT.parent / "Overall Playtype Data" / "College Basketball"
RIM_SOURCE_ROOT = ROOT.parent / "Rim Scoring Data"

PLAYTYPE_FILE_MARKERS = [
    ("pnr_bh", "P&R Ball Handler"),
    ("pnr_roll", "P&R Roll Man"),
    ("post_up", "Post-Up"),
    ("off_reb", "Offensive Rebounds"),
    ("off_screen", "Off Screen"),
    ("hand_off", "Hand Off"),
    ("spot_up", "Spot Up"),
    ("transition", "Transition"),
    ("iso", "Isolation"),
    ("cut", "Cut"),
]

RIM_SOURCE_FILES = {
    "rim_iso": "rim_iso_all.csv",
    "rim_pnr": "rim_pnr_all.csv",
    "rim_su": "rim_su_all.csv",
}

SOURCE_TO_SUFFIX = {
    "Poss": "poss",
    "Pts": "points",
    "%Time": "freq",
    "PPP": "ppp",
    "FG Att": "fg_att",
    "FG Made": "fg_made",
    "FG Miss": "fg_miss",
    "FG%": "fg_pct",
    "eFG%": "efg_pct",
    "SSQ": "ssq",
    "PPS": "pps",
    "SSM": "ssm",
    "TO%": "tov_pct",
    "%FT": "ft_share",
    "FTA/FGA": "ftr",
    "%SF": "sf_pct",
    "Score%": "score_pct",
    "2 FG Att": "two_fg_att",
    "2 FG Made": "two_fg_made",
    "2 FG Miss": "two_fg_miss",
    "2 FG%": "two_fg_pct",
    "3FG Att": "three_fg_att",
    "3 FG Made": "three_fg_made",
    "3 FG Miss": "three_fg_miss",
    "3 FG%": "three_fg_pct",
    "3PA/FGA": "three_pr",
}

RIM_SOURCE_TO_SUFFIX = {
    "Poss": "poss",
    "Points": "points",
    "PPP": "ppp",
    "FGA": "fga",
    "FGM": "fgm",
    "FGm": "fg_miss",
    "FG%": "fg_pct",
    "eFG%": "efg_pct",
    "2FGA": "two_fg_att",
    "2FGM": "two_fg_made",
    "2FGm": "two_fg_miss",
    "2FG%": "two_fg_pct",
    "3FGA": "three_fg_att",
    "3FGM": "three_fg_made",
    "3FGm": "three_fg_miss",
    "3FG%": "three_fg_pct",
    "FTA": "fta",
    "FTM": "ftm",
    "FTm": "ft_miss",
    "FT%": "ft_pct",
    "TO": "tov",
    "%TO": "tov_pct",
    "%SF": "sf_pct",
    "%Score": "score_pct",
    "+1": "plus1",
    "%+1": "plus1_pct",
}

PLAYTYPE_SUFFIX_ORDER = [
    "poss", "points", "points_pg", "points_per40",
    "freq", "ppp",
    "fg_att", "fg_made", "fg_miss", "fg_pct", "fg_att_pg", "fg_att_per40",
    "efg_pct", "ts_pct", "ssq", "pps", "ssm",
    "tov_pct", "ft_share", "ftr", "fta", "fta_pg", "fta_per40", "sf_pct", "score_pct",
    "two_fg_att", "two_fg_made", "two_fg_miss", "two_fg_pct", "two_fg_att_pg", "two_fg_att_per40",
    "three_fg_att", "three_fg_made", "three_fg_miss", "three_fg_pct", "three_fg_att_pg", "three_fg_att_per40", "three_pr",
]

RIM_SUFFIX_ORDER = [
    "poss", "points", "ppp", "freq",
    "fga", "fgm", "fg_miss", "fg_pct", "efg_pct",
    "two_fg_att", "two_fg_made", "two_fg_miss", "two_fg_pct",
    "three_fg_att", "three_fg_made", "three_fg_miss", "three_fg_pct",
    "fta", "ftm", "ft_miss", "ft_pct", "ftr",
    "tov", "tov_pct", "sf_pct", "score_pct", "plus1", "plus1_pct",
    "poss_pg", "points_pg", "fga_pg", "fgm_pg", "two_fg_att_pg", "two_fg_made_pg",
    "three_fg_att_pg", "three_fg_made_pg", "fta_pg", "ftm_pg", "tov_pg", "plus1_pg",
    "poss_per40", "points_per40", "fga_per40", "fgm_per40", "two_fg_att_per40", "two_fg_made_per40",
    "three_fg_att_per40", "three_fg_made_per40", "fta_per40", "ftm_per40", "tov_per40", "plus1_per40",
]

TEAM_STOP_WORDS = {
    "men", "mens", "women", "womens", "basketball", "university", "college",
}


def main() -> None:
    csv.field_size_limit(1024 * 1024 * 1024)
    d1_only = "--d1-only" in sys.argv
    sources = load_source_playtypes()
    rim_sources = load_rim_scoring_sources()
    print(f"Loaded {sum(len(items) for items in sources.values()):,} source playtype player rows.")
    print(f"Loaded {sum(len(items) for items in rim_sources.values()):,} source rim scoring player rows.")
    available_years = sorted({year for year, _playtype in sources} | {year for year, _component in rim_sources})

    d1_full_rows = read_multipart_csv(
        ROOT / "data" / "vendor" / "d1_enriched_all_seasons_parts",
        "D1_ENRICHED_ALL_CSV",
    )
    d1_year_rows = {
        year: read_single_assignment_csv(ROOT / "data" / "vendor" / "d1_year_chunks" / f"{year}.js")
        for year in available_years
        if (ROOT / "data" / "vendor" / "d1_year_chunks" / f"{year}.js").exists()
    }
    d2_rows = [] if d1_only else read_single_assignment_csv(ROOT / "data" / "d2_all_seasons.js")
    naia_rows = [] if d1_only else read_multipart_csv(
        ROOT / "data" / "vendor" / "naia_all_seasons_parts",
        "NAIA_ALL_CSV",
    )

    summaries = []
    summaries.append(("d1-full", apply_sources_to_dataset("d1", d1_full_rows, sources)))
    summaries.append(("d1-rim-full", apply_rim_sources_to_d1(d1_full_rows, rim_sources)))
    for year, rows in d1_year_rows.items():
        summaries.append((f"d1-year-{year}", apply_sources_to_dataset("d1", rows, sources)))
        summaries.append((f"d1-rim-year-{year}", apply_rim_sources_to_d1(rows, rim_sources)))
    if not d1_only:
        summaries.append(("d2", apply_sources_to_dataset("d2", d2_rows, sources)))
        summaries.append(("naia", apply_sources_to_dataset("naia", naia_rows, sources)))

    write_multipart_csv(
        d1_full_rows,
        ROOT / "data" / "vendor" / "d1_enriched_all_seasons_parts",
        ROOT / "data" / "vendor" / "d1_enriched_all_seasons_manifest.js",
        "D1_ENRICHED_ALL_CSV",
        "D1_ENRICHED_ALL_SEASONS_PARTS",
    )
    for year, rows in d1_year_rows.items():
        write_d1_year_chunk(year, rows, ROOT / "data" / "vendor" / "d1_year_chunks" / f"{year}.js")
    if not d1_only:
        write_single_assignment_csv(d2_rows, ROOT / "data" / "d2_all_seasons.js", "D2_ALL_CSV")
        write_multipart_csv(
            d2_rows,
            ROOT / "data" / "vendor" / "d2_all_seasons_parts",
            ROOT / "data" / "vendor" / "d2_all_seasons_manifest.js",
            "D2_ALL_CSV",
            "D2_ALL_SEASONS_PARTS",
        )
        write_multipart_csv(
            naia_rows,
            ROOT / "data" / "vendor" / "naia_all_seasons_parts",
            ROOT / "data" / "vendor" / "naia_all_seasons_manifest.js",
            "NAIA_ALL_CSV",
            "NAIA_ALL_SEASONS_PARTS",
        )

    for name, summary in summaries:
        print(
            f"{name}: matched {summary['matched']:,}/{summary['candidate_sources']:,} source rows, "
            f"updated {summary['updated_rows']:,} site rows"
        )


def load_source_playtypes() -> dict[tuple[int, str], list[dict[str, str]]]:
    grouped: dict[tuple[int, str, str, str], dict[str, str]] = {}
    for year_dir in sorted(SOURCE_ROOT.glob("*")):
        if not year_dir.is_dir() or not year_dir.name.isdigit():
            continue
        year = int(year_dir.name)
        for path in sorted(year_dir.glob("*.csv")):
            playtype = detect_playtype_id(path.name)
            if not playtype:
                continue
            for row in read_source_csv(path):
                player = clean_text(row.get("Player"))
                team = clean_text(row.get("Team"))
                if not player or not team:
                    continue
                key = (year, playtype, normalize_name(player), normalize_team(team))
                existing = grouped.get(key)
                if existing is None or source_row_score(row) > source_row_score(existing):
                    row = dict(row)
                    row["_source_year"] = str(year)
                    row["_playtype_id"] = playtype
                    grouped[key] = row

    by_year_type: dict[tuple[int, str], list[dict[str, str]]] = defaultdict(list)
    for row in grouped.values():
        by_year_type[(int(row["_source_year"]), row["_playtype_id"])].append(row)
    return by_year_type


def load_rim_scoring_sources() -> dict[tuple[int, str], list[dict[str, str]]]:
    grouped: dict[tuple[int, str, str, str], dict[str, str]] = {}
    for component, filename in RIM_SOURCE_FILES.items():
        path = RIM_SOURCE_ROOT / filename
        if not path.exists():
            continue
        for row in read_source_csv(path):
            year = season_end_year(row.get("Season"))
            if year is None:
                continue
            player = clean_text(row.get("Player"))
            team = clean_text(row.get("Team"))
            if not player or not team:
                continue
            key = (year, component, normalize_name(player), normalize_team(team))
            existing = grouped.get(key)
            if existing is None or rim_source_row_score(row) > rim_source_row_score(existing):
                row = dict(row)
                row["_source_year"] = str(year)
                row["_rim_component"] = component
                grouped[key] = row

    by_year_component: dict[tuple[int, str], list[dict[str, str]]] = defaultdict(list)
    for row in grouped.values():
        by_year_component[(int(row["_source_year"]), row["_rim_component"])].append(row)
    return by_year_component


def season_end_year(value: object) -> int | None:
    text = clean_text(value)
    if not text:
        return None
    match = re.search(r"(\d{4})(?:\s*-\s*(\d{2}|\d{4}))?", text)
    if not match:
        return None
    start = int(match.group(1))
    if not match.group(2):
        return start
    end = match.group(2)
    if len(end) == 4:
        return int(end)
    century = start // 100
    candidate = century * 100 + int(end)
    if candidate < start:
        candidate += 100
    return candidate


def rim_source_row_score(row: dict[str, str]) -> float:
    poss = parse_number(row.get("Poss"))
    fga = parse_number(row.get("FGA"))
    pts = parse_number(row.get("Points"))
    gp = parse_number(row.get("GP"))
    return (poss or 0.0) * 1000 + (fga or 0.0) * 10 + (pts or 0.0) + (gp or 0.0) * 0.001


def detect_playtype_id(filename: str) -> str:
    for playtype_id, marker in PLAYTYPE_FILE_MARKERS:
        if f" - {marker} - " in filename:
            return playtype_id
    return ""


def read_source_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        first = handle.readline()
        if not first.lower().startswith("sep="):
            handle.seek(0)
        return list(csv.DictReader(handle))


def source_row_score(row: dict[str, str]) -> float:
    poss = parse_number(row.get("Poss"))
    fga = parse_number(row.get("FG Att"))
    pts = parse_number(row.get("Pts"))
    gp = parse_number(row.get("GP"))
    return (poss or 0.0) * 1000 + (fga or 0.0) * 10 + (pts or 0.0) + (gp or 0.0) * 0.001


def apply_sources_to_dataset(dataset_id: str, rows: list[dict[str, str]], sources: dict[tuple[int, str], list[dict[str, str]]]) -> dict[str, int]:
    rows_by_season = build_target_index(dataset_id, rows)
    summary = {"candidate_sources": 0, "matched": 0, "updated_rows": 0}
    updated_ids: set[int] = set()
    for (source_year, playtype_id), source_rows in sources.items():
        season_label = dataset_season_label(dataset_id, source_year)
        index = rows_by_season.get(season_label)
        if not index:
            continue
        summary["candidate_sources"] += len(source_rows)
        for source_row in source_rows:
            target = choose_target_row(index, dataset_id, source_row)
            if target is None:
                continue
            summary["matched"] += 1
            update_row_playtype_values(target, playtype_id, source_row)
            updated_ids.add(id(target))
    summary["updated_rows"] = len(updated_ids)
    return summary


def apply_rim_sources_to_d1(rows: list[dict[str, str]], sources: dict[tuple[int, str], list[dict[str, str]]]) -> dict[str, int]:
    rows_by_season = build_target_index("d1", rows)
    summary = {"candidate_sources": 0, "matched": 0, "updated_rows": 0}
    updated_ids: set[int] = set()
    for (source_year, component), source_rows in sources.items():
        season_label = dataset_season_label("d1", source_year)
        index = rows_by_season.get(season_label)
        if not index:
            continue
        summary["candidate_sources"] += len(source_rows)
        for source_row in source_rows:
            target = choose_target_row(index, "d1", source_row)
            if target is None:
                continue
            summary["matched"] += 1
            update_row_rim_scoring_values(target, component, source_row)
            updated_ids.add(id(target))
    summary["updated_rows"] = len(updated_ids)
    return summary


def build_target_index(dataset_id: str, rows: list[dict[str, str]]) -> dict[str, dict[str, object]]:
    by_season: dict[str, dict[str, object]] = {}
    for row in rows:
        season = clean_text(row.get("season"))
        if not season:
            continue
        entry = by_season.setdefault(season, {
            "rows": [],
            "team": defaultdict(list),
            "player": defaultdict(list),
            "team_player": defaultdict(list),
        })
        entry["rows"].append(row)
        player = target_player_name(dataset_id, row)
        player_key = normalize_name(player)
        if player_key:
            entry["player"][player_key].append(row)
        for key in target_team_keys(row):
            entry["team"][key].append(row)
            if player_key:
                entry["team_player"][f"{key}|{player_key}"].append(row)
    return by_season


def choose_target_row(index: dict[str, object], dataset_id: str, source_row: dict[str, str]) -> dict[str, str] | None:
    source_name = clean_text(source_row.get("Player"))
    source_team = clean_text(source_row.get("Team"))
    source_name_key = normalize_name(source_name)
    source_keys = source_team_keys(source_team)
    exact_candidates: list[dict[str, str]] = []
    seen_exact: set[int] = set()
    team_player_map = index.get("team_player", {})
    for key in source_keys:
        for row in team_player_map.get(f"{key}|{source_name_key}", []):
            row_id = id(row)
            if row_id in seen_exact:
                continue
            seen_exact.add(row_id)
            exact_candidates.append(row)
    if exact_candidates:
        return max(exact_candidates, key=row_match_quality)

    exact_name_candidates = index["player"].get(source_name_key, [])
    if exact_name_candidates:
        team_matched = [row for row in exact_name_candidates if team_similarity(source_team, row) >= 0.72]
        if team_matched:
            return max(team_matched, key=lambda row: (team_similarity(source_team, row) * 20) + row_match_quality(row))

    team_candidates: list[dict[str, str]] = []
    seen: set[int] = set()
    team_map = index["team"]
    for key in source_keys:
        for row in team_map.get(key, []):
            row_id = id(row)
            if row_id in seen:
                continue
            seen.add(row_id)
            team_candidates.append(row)

    require_team_match = False
    candidates = team_candidates
    if not candidates:
        candidates = index["player"].get(source_name_key, [])
        require_team_match = True
    if not candidates:
        return None

    best_row = None
    best_score = -1.0
    for row in candidates:
        name_score = player_similarity(source_name, target_player_name(dataset_id, row))
        if name_score < 0.86:
            continue
        team_score = team_similarity(source_team, row)
        if require_team_match and team_score < 0.72:
            continue
        score = (name_score * 100) + (team_score * 20) + row_match_quality(row)
        if score > best_score:
            best_row = row
            best_score = score
    if best_row is not None:
        return best_row

    # Final fallback: exact-ish player and reasonably close team string.
    for row in index["player"].get(source_name_key, []):
        if team_similarity(source_team, row) >= 0.72:
            return row
    return None


def update_row_playtype_values(row: dict[str, str], playtype_id: str, source_row: dict[str, str]) -> None:
    values: dict[str, float | str] = {}
    for source_column, suffix in SOURCE_TO_SUFFIX.items():
        value = parse_number(source_row.get(source_column))
        if value is None:
            continue
        values[suffix] = value

    fg_att = number_or_none(values.get("fg_att"))
    ftr = number_or_none(values.get("ftr"))
    if fg_att is not None and ftr is not None:
        values["fta"] = round_value(fg_att * ftr, 3)
    poss = number_or_none(values.get("poss"))
    ppp = number_or_none(values.get("ppp"))
    points = number_or_none(values.get("points"))
    if points is None and poss is not None and ppp is not None:
        points = poss * ppp
        values["points"] = round_value(points, 3)
    fta = number_or_none(values.get("fta"))
    if points is not None and fg_att is not None and fta is not None:
        ts_pct = zero_safe_ts_pct(points, fg_att, fta)
        if ts_pct is not None:
            values["ts_pct"] = ts_pct

    gp = parse_number(row.get("gp") or row.get("GP") or source_row.get("GP"))
    minutes = parse_number(row.get("min") or row.get("mp"))
    mpg = parse_number(row.get("mpg") or row.get("min_per_g"))
    if minutes is None and gp and mpg:
        minutes = gp * mpg
    per_bases = ["points", "fg_att", "two_fg_att", "three_fg_att", "fta"]
    for base in per_bases:
        total = number_or_none(values.get(base))
        if total is None:
            continue
        if gp and gp > 0:
            values[f"{base}_pg"] = round_value(total / gp, 3)
        if minutes and minutes > 0:
            values[f"{base}_per40"] = round_value(total * 40 / minutes, 3)

    for suffix in PLAYTYPE_SUFFIX_ORDER:
        column = f"{playtype_id}_{suffix}"
        if suffix in values:
            row[column] = format_csv_number(values[suffix])
        elif column not in row:
            row[column] = ""


def update_row_rim_scoring_values(row: dict[str, str], prefix: str, source_row: dict[str, str]) -> None:
    values: dict[str, float | str] = {}
    for source_column, suffix in RIM_SOURCE_TO_SUFFIX.items():
        value = parse_number(source_row.get(source_column))
        if value is None:
            continue
        values[suffix] = value

    poss = number_or_none(values.get("poss"))
    points = number_or_none(values.get("points"))
    ppp = number_or_none(values.get("ppp"))
    if points is None and poss is not None and ppp is not None:
        points = poss * ppp
        values["points"] = round_value(points, 3)
    if ppp is None and points is not None and poss is not None and poss > 0:
        values["ppp"] = round_value(points / poss, 3)

    fga = number_or_none(values.get("fga"))
    fgm = number_or_none(values.get("fgm"))
    if "fg_miss" not in values and fga is not None and fgm is not None:
        values["fg_miss"] = max(0.0, fga - fgm)
    two_att = number_or_none(values.get("two_fg_att"))
    two_made = number_or_none(values.get("two_fg_made"))
    if "two_fg_miss" not in values and two_att is not None and two_made is not None:
        values["two_fg_miss"] = max(0.0, two_att - two_made)
    three_att = number_or_none(values.get("three_fg_att"))
    three_made = number_or_none(values.get("three_fg_made"))
    if "three_fg_miss" not in values and three_att is not None and three_made is not None:
        values["three_fg_miss"] = max(0.0, three_att - three_made)
    fta = number_or_none(values.get("fta"))
    ftm = number_or_none(values.get("ftm"))
    if "ft_miss" not in values and fta is not None and ftm is not None:
        values["ft_miss"] = max(0.0, fta - ftm)
    if "ftr" not in values and fga is not None and fga > 0 and fta is not None:
        values["ftr"] = round_value(fta / fga, 3)

    gp = parse_number(row.get("gp") or row.get("GP") or source_row.get("GP"))
    minutes = parse_number(row.get("min") or row.get("mp"))
    mpg = parse_number(row.get("mpg") or row.get("min_per_g"))
    if minutes is None and gp and mpg:
        minutes = gp * mpg
    per_bases = [
        "poss", "points", "fga", "fgm", "two_fg_att", "two_fg_made",
        "three_fg_att", "three_fg_made", "fta", "ftm", "tov", "plus1",
    ]
    for base in per_bases:
        total = number_or_none(values.get(base))
        if total is None:
            continue
        if gp and gp > 0:
            values[f"{base}_pg"] = round_value(total / gp, 3)
        if minutes and minutes > 0:
            values[f"{base}_per40"] = round_value(total * 40 / minutes, 3)

    for suffix in RIM_SUFFIX_ORDER:
        column = f"{prefix}_{suffix}"
        if suffix in values:
            row[column] = format_csv_number(values[suffix])
        elif column not in row:
            row[column] = ""


def dataset_season_label(dataset_id: str, source_year: int) -> str:
    if dataset_id == "d1":
        return str(source_year)
    return f"{source_year - 1}-{str(source_year)[-2:]}"


def target_player_name(dataset_id: str, row: dict[str, str]) -> str:
    return clean_text(row.get("player_name") or row.get("player") or row.get("name"))


def target_team_keys(row: dict[str, str]) -> set[str]:
    keys: set[str] = set()
    for column in ("team_name", "team_full", "team_search_text", "team_alias", "team_aliases", "career_path"):
        keys.update(team_alias_keys(row.get(column)))
    return {key for key in keys if key}


def source_team_keys(value: str) -> set[str]:
    keys = team_alias_keys(value)
    normalized = normalize_team(value)
    parts = normalized.split()
    for length in range(len(parts), 0, -1):
        prefix = " ".join(parts[:length])
        if prefix:
            keys.update(team_alias_keys(prefix))
    return {key for key in keys if key}


def team_alias_keys(value: object) -> set[str]:
    text = clean_text(value)
    if not text:
        return set()
    pieces = re.split(r"\s*(?:/|\||;|->|,)\s*", text)
    keys: set[str] = set()
    for piece in pieces:
        key = normalize_team(piece)
        if not key:
            continue
        keys.add(key)
        keys.add(expand_state_abbrev(key))
        keys.add(contract_state_word(key))
        parts = [part for part in key.split() if part not in TEAM_STOP_WORDS]
        if parts:
            keys.add(" ".join(parts))
    return {key for key in keys if key}


def player_similarity(left: str, right: str) -> float:
    left_key = normalize_name(left)
    right_key = normalize_name(right)
    if not left_key or not right_key:
        return 0.0
    if left_key == right_key:
        return 1.0
    left_parts = left_key.split()
    right_parts = right_key.split()
    if left_parts and right_parts and left_parts[-1] == right_parts[-1] and left_parts[0][:1] == right_parts[0][:1]:
        return max(0.9, difflib.SequenceMatcher(None, left_key, right_key).ratio())
    return difflib.SequenceMatcher(None, left_key, right_key).ratio()


def team_similarity(source_team: str, row: dict[str, str]) -> float:
    source_keys = source_team_keys(source_team)
    target_keys = target_team_keys(row)
    if source_keys & target_keys:
        return 1.0
    if not source_keys or not target_keys:
        return 0.0
    best = 0.0
    for left in source_keys:
        for right in target_keys:
            if left.startswith(right) or right.startswith(left):
                best = max(best, 0.92)
            best = max(best, difflib.SequenceMatcher(None, left, right).ratio())
    return best


def row_match_quality(row: dict[str, str]) -> float:
    minutes = parse_number(row.get("min") or row.get("mp")) or 0.0
    gp = parse_number(row.get("gp") or row.get("g")) or 0.0
    return min(minutes / 10000, 2.0) + min(gp / 100, 0.5)


def read_single_assignment_csv(path: Path) -> list[dict[str, str]]:
    text = extract_js_string(path)
    return parse_csv_rows(text)


def read_multipart_csv(parts_dir: Path, global_name: str) -> list[dict[str, str]]:
    chunks = []
    for path in sorted(parts_dir.glob("part-*.js")):
        if path.is_file():
            chunks.append(extract_js_string(path))
    return parse_csv_rows("".join(chunks))


def parse_csv_rows(text: str) -> list[dict[str, str]]:
    if not text:
        return []
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


def extract_js_string(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    matches = list(re.finditer(r'(\")(?:(?:\\.)|[^"\\])*\1', text, flags=re.S))
    if not matches:
        raise ValueError(f"No JS string found in {path}")
    return json.loads(matches[-1].group(0))


def rows_to_csv_text(rows: list[dict[str, str]]) -> str:
    fieldnames = collect_fieldnames(rows)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator="\n", extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key, "") for key in fieldnames})
    return output.getvalue()


def collect_fieldnames(rows: list[dict[str, str]]) -> list[str]:
    fieldnames: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in row.keys():
            if key is None or key == "" or key in seen:
                continue
            seen.add(key)
            fieldnames.append(key)
    for playtype_id, _marker in PLAYTYPE_FILE_MARKERS:
        for suffix in PLAYTYPE_SUFFIX_ORDER:
            key = f"{playtype_id}_{suffix}"
            if key not in seen:
                seen.add(key)
                fieldnames.append(key)
    has_rim_columns = any(
        any(key.startswith(f"{prefix}_") for key in row.keys() for prefix in RIM_SOURCE_FILES)
        for row in rows
    )
    if has_rim_columns:
        for prefix in RIM_SOURCE_FILES:
            for suffix in RIM_SUFFIX_ORDER:
                key = f"{prefix}_{suffix}"
                if key not in seen:
                    seen.add(key)
                    fieldnames.append(key)
    return fieldnames


def write_single_assignment_csv(rows: list[dict[str, str]], path: Path, global_name: str) -> None:
    text = rows_to_csv_text(rows)
    path.write_text(f"window.{global_name} = {json.dumps(text, ensure_ascii=False)};\n", encoding="utf-8")


def write_d1_year_chunk(year: int, rows: list[dict[str, str]], path: Path) -> None:
    text = rows_to_csv_text(rows)
    path.write_text(
        "window.D1_YEAR_CSV_CHUNKS = window.D1_YEAR_CSV_CHUNKS || {};\n"
        f"window.D1_YEAR_CSV_CHUNKS[{json.dumps(str(year))}] = {json.dumps(text, ensure_ascii=False)};\n",
        encoding="utf-8",
    )


def write_multipart_csv(rows: list[dict[str, str]], parts_dir: Path, manifest_path: Path, data_global: str, parts_global: str) -> None:
    text = rows_to_csv_text(rows)
    chunks = split_csv_text(text)
    parts_dir.mkdir(parents=True, exist_ok=True)
    valid_dir = parts_dir.resolve()
    for path in parts_dir.glob("part-*.js"):
        resolved = path.resolve()
        if resolved.parent == valid_dir:
            path.unlink()
    part_names = []
    for index, chunk in enumerate(chunks, start=1):
        name = f"part-{index:03d}"
        part_names.append(name)
        (parts_dir / f"{name}.js").write_text(
            f"window.{data_global} = (window.{data_global} || \"\") + {json.dumps(chunk, ensure_ascii=False)};\n",
            encoding="utf-8",
        )
    manifest_path.write_text(f"window.{parts_global} = {json.dumps(part_names)};\n", encoding="utf-8")


def split_csv_text(text: str, max_chars: int = 3_500_000) -> list[str]:
    chunks: list[str] = []
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


def zero_safe_ts_pct(points: float, fga: float, fta: float) -> float | None:
    denom = 2 * (fga + 0.44 * fta)
    if denom <= 0:
        return None
    return round_value((points / denom) * 100, 3)


def parse_number(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        numeric = float(value)
        return numeric if math.isfinite(numeric) else None
    text = str(value).strip().replace("%", "").replace(",", "")
    if not text:
        return None
    try:
        numeric = float(text)
    except ValueError:
        return None
    return numeric if math.isfinite(numeric) else None


def number_or_none(value: object) -> float | None:
    return parse_number(value)


def round_value(value: float, digits: int = 3) -> float:
    return round(float(value), digits)


def format_csv_number(value: object) -> str:
    numeric = parse_number(value)
    if numeric is None:
        return clean_text(value)
    numeric = round_value(numeric, 3)
    if abs(numeric - round(numeric)) < 1e-9:
        return str(int(round(numeric)))
    return f"{numeric:.3f}".rstrip("0").rstrip(".")


def clean_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def normalize_ascii(value: object) -> str:
    text = unicodedata.normalize("NFKD", clean_text(value))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return text


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
    text = re.sub(r"\s+", " ", text).strip()
    return text


def expand_state_abbrev(key: str) -> str:
    return re.sub(r"\bst\b", "state", key)


def contract_state_word(key: str) -> str:
    return re.sub(r"\bstate\b", "st", key)


if __name__ == "__main__":
    sys.exit(main())
