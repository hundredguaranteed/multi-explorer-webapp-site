from __future__ import annotations

import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path

csv.field_size_limit(1024 * 1024 * 128)

ROOT = Path(__file__).resolve().parent
SOURCE_CSV = ROOT / "generated" / "player_career_rows.csv"
OUTPUT_DIR = ROOT / "data" / "vendor" / "player_career_year_chunks"
SUPPLEMENT_OUTPUT_DIR = ROOT / "data" / "vendor" / "player_career_year_supplement_chunks"
YEAR_PARTS_DIR = ROOT / "data" / "vendor" / "player_career_year_chunk_parts"
SUPPLEMENT_PARTS_DIR = ROOT / "data" / "vendor" / "player_career_year_supplement_chunk_parts"
MANIFEST_PATH = ROOT / "data" / "vendor" / "player_career_year_manifest.js"
TEMP_DIR = OUTPUT_DIR / "_tmp"
CHUNK_GLOBAL = "PLAYER_CAREER_YEAR_CSV_CHUNKS"
SUPPLEMENT_CHUNK_GLOBAL = "PLAYER_CAREER_YEAR_SUPPLEMENT_CSV_CHUNKS"
MIN_YEAR = 1998
MULTIPART_TARGET_BYTES = 12 * 1024 * 1024

PLAYER_CAREER_BASE_COLUMNS = [
    "player_id", "canonical_player_id", "realgm_player_id", "source_player_id", "player_profile_key",
    "player_name", "player_search_text", "player_aliases",
    "season", "source_dataset", "competition_level",
    "team_name", "team_full", "team_search_text", "team_aliases",
    "league", "career_path", "profile_levels", "profile_match_source", "realgm_summary_url",
    "nationality", "hometown", "high_school", "pre_draft_team", "current_team", "current_nba_status",
    "dob", "height_in", "weight_lb", "age", "pos", "class_year", "draft_pick", "rookie_year",
    "gp", "min", "mpg", "pts", "trb", "orb", "drb", "ast", "stl", "blk", "tov", "pf",
    "fgm", "fga", "two_pm", "two_pa", "three_pm", "three_pa", "ftm", "fta",
    "fg_pct", "two_p_pct", "three_p_pct", "ft_pct", "efg_pct", "ts_pct", "ftr", "three_pr",
    "rim_made", "rim_att", "rim_pct", "mid_made", "mid_att", "mid_pct",
    "adjoe", "adrtg", "porpag", "dporpag", "bpm", "per", "rgm_per", "off", "def", "tot", "ewins",
    "orb_pct", "drb_pct", "trb_pct", "ast_pct", "tov_pct", "stl_pct", "blk_pct", "usg_pct", "ast_to",
    "pts_pg", "trb_pg", "ast_pg", "stl_pg", "blk_pg", "tov_pg",
    "pts_per40", "trb_per40", "ast_per40", "stl_per40", "blk_per40",
    "plus_minus", "plus_minus_pg", "eff", "eff_pg", "roster_games", "start", "seasontype",
    "conference", "coach", "coach_search_text", "bmi", "total_poss",
    "competition_key", "competition_label", "edition_id", "team_code", "region",
    "circuit", "setting", "event_name", "event_group", "event_raw_name", "event_url", "age_range", "state", "team_state",
]


def canonical_season_label(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    match = re.search(r"(\d{4})\s*[-/]\s*(\d{2,4})", text)
    if match:
        end_part = match.group(2)
        return str(int(f"20{end_part}" if len(end_part) == 2 else end_part))
    years = re.findall(r"\d{4}", text)
    if years:
        return str(int(years[-1]))
    try:
        return str(int(round(float(text))))
    except ValueError:
        return text


def compare_seasons(left: str) -> tuple[int, str]:
    try:
        return (-int(left), left)
    except ValueError:
        return (0, left)


def split_text_by_bytes(text: str, max_bytes: int = MULTIPART_TARGET_BYTES) -> list[str]:
    if len(text.encode("utf-8")) <= max_bytes:
        return [text]
    lines = text.splitlines(keepends=True)
    chunks: list[str] = []
    current_lines: list[str] = []
    current_size = 0
    for line in lines:
        line_size = len(line.encode("utf-8"))
        if current_lines and current_size + line_size > max_bytes:
            chunks.append("".join(current_lines))
            current_lines = [line]
            current_size = line_size
            continue
        current_lines.append(line)
        current_size += line_size
    if current_lines:
        chunks.append("".join(current_lines))
    return chunks or [text]


def write_store_multipart_parts(
    parts_dir: Path,
    store_global: str,
    season: str,
    csv_text: str,
) -> list[str]:
    if len(csv_text.encode("utf-8")) <= MULTIPART_TARGET_BYTES:
        return []
    parts_dir.mkdir(parents=True, exist_ok=True)
    chunks = split_text_by_bytes(csv_text, MULTIPART_TARGET_BYTES)
    part_ids = [f"{season}-part-{index:03d}" for index in range(1, len(chunks) + 1)]
    for part_id, chunk_text in zip(part_ids, chunks):
        source = "\n".join([
            f"window.{store_global} = window.{store_global} || {{}};",
            f"window.{store_global}[{json.dumps(season)}] = (window.{store_global}[{json.dumps(season)}] || '') + {json.dumps(chunk_text)};",
            "",
        ])
        (parts_dir / f"{part_id}.js").write_text(source, encoding="utf-8")
    return part_ids


def remove_stale_part_files(parts_dir: Path, expected_names: set[str]) -> None:
    if not parts_dir.exists():
        return
    for path in parts_dir.glob("*.js"):
        if path.name not in expected_names:
            path.unlink()


def main() -> None:
    if not SOURCE_CSV.exists():
        raise FileNotFoundError(f"Missing source CSV: {SOURCE_CSV}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SUPPLEMENT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    YEAR_PARTS_DIR.mkdir(parents=True, exist_ok=True)
    SUPPLEMENT_PARTS_DIR.mkdir(parents=True, exist_ok=True)

    counts: dict[str, int] = {}
    temp_paths: dict[str, Path] = {}
    supplement_temp_paths: dict[str, Path] = {}
    temp_handles: dict[str, object] = {}
    temp_writers: dict[str, csv.DictWriter] = {}
    supplement_temp_handles: dict[str, object] = {}
    supplement_temp_writers: dict[str, csv.DictWriter] = {}
    base_fieldnames: list[str] = []
    deferred_fieldnames: list[str] = []

    try:
        with SOURCE_CSV.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames:
                raise ValueError("Player/Career CSV is missing headers")
            fieldnames = list(reader.fieldnames)
            if "season" not in fieldnames:
                raise ValueError("Player/Career CSV is missing a season column")
            base_fieldnames = [column for column in fieldnames if column in PLAYER_CAREER_BASE_COLUMNS]
            deferred_fieldnames = [column for column in fieldnames if column not in base_fieldnames]

            for row in reader:
                season = canonical_season_label(row.get("season"))
                try:
                    season_year = int(season)
                except ValueError:
                    continue
                if season_year < MIN_YEAR:
                    continue
                row["season"] = season
                if season not in temp_writers:
                    temp_path = TEMP_DIR / f"{season}.csv"
                    temp_paths[season] = temp_path
                    temp_handle = temp_path.open("w", encoding="utf-8", newline="")
                    temp_handles[season] = temp_handle
                    writer = csv.DictWriter(temp_handle, fieldnames=base_fieldnames)
                    writer.writeheader()
                    temp_writers[season] = writer
                    supplement_temp_path = TEMP_DIR / f"{season}.supplement.csv"
                    supplement_temp_paths[season] = supplement_temp_path
                    supplement_temp_handle = supplement_temp_path.open("w", encoding="utf-8", newline="")
                    supplement_temp_handles[season] = supplement_temp_handle
                    supplement_writer = csv.DictWriter(supplement_temp_handle, fieldnames=deferred_fieldnames)
                    supplement_writer.writeheader()
                    supplement_temp_writers[season] = supplement_writer
                temp_writers[season].writerow({column: row.get(column, "") for column in base_fieldnames})
                supplement_temp_writers[season].writerow({column: row.get(column, "") for column in deferred_fieldnames})
                counts[season] = counts.get(season, 0) + 1
    finally:
        for handle in temp_handles.values():
            handle.close()
        for handle in supplement_temp_handles.values():
            handle.close()

    seasons = sorted(counts.keys(), key=compare_seasons)
    expected_chunk_names = {f"{season}.js" for season in seasons}
    for path in OUTPUT_DIR.glob("*.js"):
        if path.name not in expected_chunk_names:
            path.unlink()
    for path in SUPPLEMENT_OUTPUT_DIR.glob("*.js"):
        if path.name not in expected_chunk_names:
            path.unlink()

    multipart_year_chunks: dict[str, list[str]] = {}
    multipart_supplement_chunks: dict[str, list[str]] = {}
    expected_year_part_names: set[str] = set()
    expected_supplement_part_names: set[str] = set()

    for season in seasons:
        csv_text = temp_paths[season].read_text(encoding="utf-8")
        chunk_source = "\n".join([
            f"window.{CHUNK_GLOBAL} = window.{CHUNK_GLOBAL} || {{}};",
            f"window.{CHUNK_GLOBAL}[{json.dumps(season)}] = {json.dumps(csv_text)};",
            "",
        ])
        (OUTPUT_DIR / f"{season}.js").write_text(chunk_source, encoding="utf-8")
        year_part_ids = write_store_multipart_parts(YEAR_PARTS_DIR, CHUNK_GLOBAL, season, csv_text)
        if year_part_ids:
            multipart_year_chunks[season] = year_part_ids
            expected_year_part_names.update({f"{part_id}.js" for part_id in year_part_ids})
        supplement_csv_text = supplement_temp_paths[season].read_text(encoding="utf-8")
        supplement_chunk_source = "\n".join([
            f"window.{SUPPLEMENT_CHUNK_GLOBAL} = window.{SUPPLEMENT_CHUNK_GLOBAL} || {{}};",
            f"window.{SUPPLEMENT_CHUNK_GLOBAL}[{json.dumps(season)}] = {json.dumps(supplement_csv_text)};",
            "",
        ])
        (SUPPLEMENT_OUTPUT_DIR / f"{season}.js").write_text(supplement_chunk_source, encoding="utf-8")
        supplement_part_ids = write_store_multipart_parts(SUPPLEMENT_PARTS_DIR, SUPPLEMENT_CHUNK_GLOBAL, season, supplement_csv_text)
        if supplement_part_ids:
            multipart_supplement_chunks[season] = supplement_part_ids
            expected_supplement_part_names.update({f"{part_id}.js" for part_id in supplement_part_ids})

    remove_stale_part_files(YEAR_PARTS_DIR, expected_year_part_names)
    remove_stale_part_files(SUPPLEMENT_PARTS_DIR, expected_supplement_part_names)

    manifest = {
        "years": seasons,
        "initialYears": [seasons[0]] if seasons else [],
        "counts": {season: counts[season] for season in seasons},
        "latestYear": seasons[0] if seasons else "",
        "minYear": MIN_YEAR,
        "baseColumns": base_fieldnames,
        "deferredColumns": deferred_fieldnames,
        "multipartYearChunks": multipart_year_chunks,
        "multipartSupplementChunks": multipart_supplement_chunks,
    }
    manifest_source = "\n".join([
        "// Generated by build_player_career_year_chunks.py",
        f"// {datetime.now(timezone.utc).isoformat()}",
        "window.PLAYER_CAREER_YEAR_MANIFEST = " + json.dumps(manifest, indent=2) + ";",
        "",
    ])
    MANIFEST_PATH.write_text(manifest_source, encoding="utf-8")

    for path in TEMP_DIR.glob("*.csv"):
        path.unlink()
    if TEMP_DIR.exists():
        TEMP_DIR.rmdir()

    print(json.dumps({
        "seasons": len(seasons),
        "latestSeason": seasons[0] if seasons else "",
        "earliestSeason": seasons[-1] if seasons else "",
        "totalRows": sum(counts.values()),
    }, indent=2))


if __name__ == "__main__":
    main()
