from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

csv.field_size_limit(1024 * 1024 * 128)

ROOT = Path(__file__).resolve().parent
PROJECTS_ROOT = ROOT.parent
PLAYER_CAREER_CSV = PROJECTS_ROOT / "multi-explorer-site-data" / "generated" / "player_career_rows.csv"
GRASSROOTS_MANIFEST = ROOT / "data" / "vendor" / "grassroots_year_manifest.js"

REQUIRED_SHARED_COLUMNS = ["fg_pct", "two_p_pct", "three_p_pct", "ft_pct", "efg_pct", "ts_pct", "ftr", "three_pr"]
PERCENT_COLUMNS = [
    "fg_pct", "two_p_pct", "three_p_pct", "ft_pct", "efg_pct", "ts_pct",
    "orb_pct", "drb_pct", "trb_pct", "ast_pct", "tov_pct", "stl_pct", "blk_pct", "usg_pct",
    "ftr", "three_pr",
]
SITE_SOURCE_DATASETS = {"D1", "D2", "NAIA", "JUCO", "FIBA", "NBA", "Grassroots"}


def to_float(value: object) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def main() -> None:
    if not PLAYER_CAREER_CSV.exists():
        raise FileNotFoundError(f"Missing Player/Career CSV: {PLAYER_CAREER_CSV}")

    with PLAYER_CAREER_CSV.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    missing_by_source: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    outlier_counts: dict[str, int] = defaultdict(int)
    stirtz_rows = []
    lebron_rows = []
    nba_missing_stl_blk = 0
    site_row_counts: dict[str, int] = defaultdict(int)

    for row in rows:
        source = str(row.get("source_dataset") or "").strip()
        if source in SITE_SOURCE_DATASETS:
            site_row_counts[source] += 1

        player_name = str(row.get("player_name") or "").strip().lower()
        if player_name == "bennett stirtz":
            stirtz_rows.append({
                "season": row.get("season"),
                "source_dataset": row.get("source_dataset"),
                "competition_level": row.get("competition_level"),
                "team_name": row.get("team_name"),
                "gp": row.get("gp"),
                "min": row.get("min"),
            })
        if player_name == "lebron james" and source == "Grassroots":
            lebron_rows.append({
                "season": row.get("season"),
                "team_name": row.get("team_name"),
                "competition_level": row.get("competition_level"),
            })

        if source in SITE_SOURCE_DATASETS - {"Grassroots"}:
            for column in REQUIRED_SHARED_COLUMNS:
                if str(row.get(column) or "").strip() == "":
                    missing_by_source[source][column] += 1

        if source == "NBA":
            if str(row.get("stl_pct") or "").strip() == "" or str(row.get("blk_pct") or "").strip() == "":
                nba_missing_stl_blk += 1

        for column in PERCENT_COLUMNS:
            numeric = to_float(row.get(column))
            if numeric is None:
                continue
            if numeric < 0 or numeric > 100.5:
                outlier_counts[column] += 1

    grassroots_manifest_years = []
    if GRASSROOTS_MANIFEST.exists():
        text = GRASSROOTS_MANIFEST.read_text(encoding="utf-8")
        start = text.find('"years": [')
        if start >= 0:
            end = text.find("]", start)
            years_text = text[start:end + 1].split(":", 1)[1]
            grassroots_manifest_years = json.loads(years_text)

    print(json.dumps({
        "player_career_rows": len(rows),
        "site_row_counts": dict(sorted(site_row_counts.items())),
        "required_shared_missing_by_source": {source: dict(sorted(columns.items())) for source, columns in sorted(missing_by_source.items())},
        "percent_outlier_counts": dict(sorted(outlier_counts.items())),
        "nba_rows_missing_stl_pct_or_blk_pct": nba_missing_stl_blk,
        "bennett_stirtz_rows": stirtz_rows,
        "lebron_grassroots_rows": lebron_rows[:10],
        "grassroots_years": {
            "count": len(grassroots_manifest_years),
            "earliest": grassroots_manifest_years[0] if grassroots_manifest_years else "",
            "latest": grassroots_manifest_years[-1] if grassroots_manifest_years else "",
        },
    }, indent=2))


if __name__ == "__main__":
    main()
