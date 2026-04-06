from __future__ import annotations

import csv
import os
from pathlib import Path

from build_player_identity_pipeline import (
    SHOT_PROFILE_COLUMNS,
    SITE_DATASETS,
    annotate_site_row,
    apply_rim_data,
    build_site_team_records,
    clean_text,
    dedupe_site_rows,
    is_valid_player_name,
    load_site_dataset_rows,
    runtime_key,
    seed_site_team_aliases,
    write_rewritten_site_bundles,
)


ROOT = Path(__file__).resolve().parent
PLAYER_CAREER_SOURCE = ROOT / "generated" / "player_career_rows.csv"
TARGET_DATASETS = ("d2", "naia", "juco", "fiba")
PLAYER_CAREER_SOURCE_DATASET_MAP = {
    "D2": "d2",
    "NAIA": "naia",
    "JUCO": "juco",
    "FIBA": "fiba",
}


def load_target_site_data() -> dict[str, dict[str, object]]:
    site_data: dict[str, dict[str, object]] = {}
    for dataset_id in TARGET_DATASETS:
        config = SITE_DATASETS[dataset_id]
        rows, columns = load_site_dataset_rows(dataset_id, config)
        filtered_rows = []
        for row in rows:
            annotate_site_row(dataset_id, row, config)
            if not is_valid_player_name(row.get("_player_name")):
                continue
            filtered_rows.append(row)
        site_data[dataset_id] = {
            "config": config,
            "rows": dedupe_site_rows(dataset_id, filtered_rows, config),
            "columns": columns,
        }
    return site_data


def build_site_row_lookups(site_data: dict[str, dict[str, object]]) -> dict[str, dict[str, dict[str, object]]]:
    lookups: dict[str, dict[str, dict[str, object]]] = {}
    for dataset_id, bundle in site_data.items():
        config = bundle["config"]
        dataset_lookup: dict[str, dict[str, object]] = {}
        for row in bundle["rows"]:
            season = clean_text(row.get("season"))
            if not season:
                continue
            competition_key = row.get("competition_key") if dataset_id == "fiba" else ""
            key = runtime_key(
                dataset_id,
                season,
                row.get(config["team_column"]),
                row.get(config["player_column"]),
                competition_key,
            )
            dataset_lookup[key] = {column: row.get(column, "") for column in SHOT_PROFILE_COLUMNS}
        lookups[dataset_id] = dataset_lookup
    return lookups


def make_player_career_lookup_key(row: dict[str, object]) -> str:
    dataset_id = PLAYER_CAREER_SOURCE_DATASET_MAP.get(clean_text(row.get("source_dataset")), "")
    if dataset_id not in TARGET_DATASETS:
        return ""
    competition_key = row.get("competition_key") if dataset_id == "fiba" else ""
    return runtime_key(
        dataset_id,
        row.get("season"),
        row.get("team_name"),
        row.get("player_name"),
        competition_key,
    )


def update_player_career_rows(lookups: dict[str, dict[str, dict[str, object]]]) -> dict[str, int]:
    if not PLAYER_CAREER_SOURCE.exists():
        raise FileNotFoundError(f"Missing player career source CSV: {PLAYER_CAREER_SOURCE}")

    temp_path = PLAYER_CAREER_SOURCE.with_suffix(".csv.tmp")
    updated_rows = 0
    updated_values = 0

    with PLAYER_CAREER_SOURCE.open("r", encoding="utf-8", newline="") as source_handle:
        reader = csv.DictReader(source_handle)
        fieldnames = list(reader.fieldnames or [])
        if not fieldnames:
            raise ValueError("Player/Career CSV is missing headers")
        with temp_path.open("w", encoding="utf-8", newline="") as target_handle:
            writer = csv.DictWriter(target_handle, fieldnames=fieldnames)
            writer.writeheader()
            for row in reader:
                dataset_id = PLAYER_CAREER_SOURCE_DATASET_MAP.get(clean_text(row.get("source_dataset")), "")
                dataset_lookup = lookups.get(dataset_id)
                key = make_player_career_lookup_key(row)
                payload = dataset_lookup.get(key) if dataset_lookup and key else None
                row_updated = False
                if payload:
                    for column, value in payload.items():
                        text_value = clean_text(value)
                        if not text_value:
                            continue
                        if clean_text(row.get(column)) != text_value:
                            row[column] = text_value
                            updated_values += 1
                            row_updated = True
                if row_updated:
                    updated_rows += 1
                writer.writerow(row)

    os.replace(temp_path, PLAYER_CAREER_SOURCE)
    return {
        "updated_rows": updated_rows,
        "updated_values": updated_values,
    }


def main() -> None:
    site_data = load_target_site_data()
    site_team_records = build_site_team_records(site_data)
    team_alias_map, team_alias_details = seed_site_team_aliases(site_team_records)
    rim_summary = apply_rim_data(site_data, team_alias_map, team_alias_details)
    write_rewritten_site_bundles(site_data)
    player_career_summary = update_player_career_rows(build_site_row_lookups(site_data))

    print({
        "rim_summary": rim_summary,
        "player_career_summary": player_career_summary,
    })


if __name__ == "__main__":
    main()
