from __future__ import annotations

import csv
import io
import json
import math
import re
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

csv.field_size_limit(1024 * 1024 * 128)


ROOT = Path(__file__).resolve().parent
PROJECTS_ROOT = ROOT.parent
SITE_DATA_ROOT = PROJECTS_ROOT / "multi-explorer-site-data"
GENERATED_DIR = SITE_DATA_ROOT / "generated"
MANIFEST_DIR = SITE_DATA_ROOT / "manifests"

REALGM_ROOT = PROJECTS_ROOT / "realgm_college_crawl"
REALGM_PRIMARY_ROOT = REALGM_ROOT / "output_parallel_6"
REALGM_SECONDARY_ROOT = REALGM_ROOT / "output_parallel"
REALGM_SUPPLEMENTAL_ROOT = REALGM_ROOT / "output_full"
REALGM_NBA_ROOT = PROJECTS_ROOT / "pbp" / "realgm_nba_crawl" / "output_full"
REALGM_REFERENCE_ROOT = PROJECTS_ROOT / "pbp" / "realgm_reference_v1"
REALGM_REFERENCE_PLAYERS_PATH = REALGM_REFERENCE_ROOT / "reference_players.csv"
REALGM_REFERENCE_ROWS_PATH = REALGM_REFERENCE_ROOT / "reference_rows.csv"
RIM_ROOT = PROJECTS_ROOT / "Rim Data"
BARTTORVIK_DIR = PROJECTS_ROOT / "cbb_onoff_lab" / "cache" / "barttorvik"
NBA_EPM_DIR = PROJECTS_ROOT / "NBA EPM"

PLAYER_CAREER_BUNDLE_PATH = ROOT / "data" / "vendor" / "player_career_all_seasons.js"
PLAYER_CAREER_YEAR_MANIFEST_PATH = ROOT / "data" / "vendor" / "player_career_year_manifest.js"
PLAYER_CAREER_YEAR_CHUNK_DIR = ROOT / "data" / "vendor" / "player_career_year_chunks"
GRASSROOTS_YEAR_MANIFEST_PATH = ROOT / "data" / "vendor" / "grassroots_year_manifest.js"
GRASSROOTS_YEAR_CHUNK_DIR = ROOT / "data" / "vendor" / "grassroots_year_chunks"

SHOT_PROFILE_COLUMNS = ["rim_made", "rim_att", "rim_pct", "mid_made", "mid_att", "mid_pct", "rim_source_gp"]

PLAYER_CAREER_PASSTHROUGH_SKIP_COLUMNS = {
    "player", "player_name", "player_id", "pid", "id",
    "team_id", "team_name", "team_full", "team_alias", "team_alias_all",
    "season", "league", "level",
    "canonical_player_id", "player_profile_key", "source_player_id", "realgm_player_id",
    "realgm_summary_url", "profile_match_source", "profile_career_path", "profile_levels",
    "dob", "height_in", "inches", "height", "weight", "weight_lb", "weight_text", "age",
    "pos", "pos_text", "class_year", "draft_pick", "rookie_year",
    "gp", "g", "min", "mp", "mpg", "pts", "trb", "reb", "orb", "drb", "ast", "stl", "blk", "tov", "pf",
    "fgm", "fga", "fg_att", "2pm", "2pa", "3pm", "3pa", "tpm", "tpa", "ftm", "fta",
    "fga_75", "fta_75", "fg3a_75",
    "fg_pct", "2p_pct", "3p_pct", "tp_pct", "ft_pct", "ftpct", "efg", "efg_pct", "ts_pct", "tspct",
    "fg2pct", "fg3pct", "fgpct_rim", "fgpct_mid",
    "ftr", "three_pr", "fta_rate", "tpa_rate",
    "orb_pct", "drb_pct", "trb_pct", "ast_pct", "tov_pct", "stl_pct", "blk_pct", "usg_pct",
    "orbpct", "drbpct", "trbpct", "astpct", "topct", "stlpct", "blkpct", "usg",
    "rim_made", "rim_att", "rim_pct", "mid_made", "mid_att", "mid_pct",
    "ast_to", "stocks", "stocks_pg", "stocks_per40",
    "pts_pg", "trb_pg", "ast_pg", "stl_pg", "blk_pg", "tov_pg",
    "pts_per40", "trb_per40", "ast_per40", "stl_per40", "blk_per40",
}

SITE_DATASETS = {
    "d1": {
        "path": ROOT / "data" / "d1_enriched_all_seasons.js",
        "global_name": "D1_ENRICHED_ALL_CSV",
        "player_column": "player_name",
        "team_column": "team_name",
        "team_display_column": "team_full",
        "label": "D1",
        "profile_level": "D1",
        "type": "college",
    },
    "d2": {
        "path": ROOT / "data" / "d2_all_seasons.js",
        "global_name": "D2_ALL_CSV",
        "player_column": "player",
        "team_column": "team_name",
        "team_display_column": "team_name",
        "label": "D2",
        "profile_level": "D2",
        "type": "college",
    },
    "naia": {
        "path": ROOT / "data" / "vendor" / "naia_all_seasons.js",
        "global_name": "NAIA_ALL_CSV",
        "player_column": "player_name",
        "team_column": "team_name",
        "team_display_column": "team_name",
        "label": "NAIA",
        "profile_level": "NAIA",
        "type": "college",
    },
    "juco": {
        "path": ROOT / "data" / "vendor" / "juco_all_seasons.js",
        "global_name": "NJCAA_ALL_CSV",
        "player_column": "player_name",
        "team_column": "team_name",
        "team_display_column": "team_name",
        "label": "JUCO",
        "profile_level": "JUCO",
        "type": "college",
    },
    "fiba": {
        "path": ROOT / "data" / "fiba_all_seasons.js",
        "global_name": "FIBA_ALL_CSV",
        "player_column": "player_name",
        "team_column": "team_name",
        "team_display_column": "team_name",
        "label": "FIBA",
        "profile_level": "FIBA",
        "type": "fiba",
    },
    "nba": {
        "path": ROOT / "data" / "nba_all_seasons.js",
        "global_name": "NBA_ALL_CSV",
        "player_column": "player_name",
        "team_column": "team_alias",
        "team_display_column": "team_alias_all",
        "label": "NBA",
        "profile_level": "NBA",
        "type": "nba",
    },
}

RIM_DATASETS = {
    "d2": {
        "rim_dir": RIM_ROOT / "D2 Rim Stats",
        "season_parser": lambda file_name: season_from_hyphen_file(file_name),
        "player_column": "player",
        "team_column": "team_name",
        "row_key": lambda row: runtime_key("d2", row.get("season"), row.get("team_name"), row.get("player")),
        "two_att": lambda row: first_number(row.get("two_pa"), subtract_numbers(to_float(row.get("fga")), to_float(row.get("3pa")))),
        "two_made": lambda row: first_number(row.get("two_pm"), subtract_numbers(to_float(row.get("fgm")), to_float(row.get("3pm")))),
    },
    "naia": {
        "rim_dir": RIM_ROOT / "NAIA Rim Data",
        "season_parser": lambda file_name: season_from_hyphen_file(file_name),
        "player_column": "player_name",
        "team_column": "team_name",
        "row_key": lambda row: runtime_key("naia", row.get("season"), row.get("team_name"), row.get("player_name")),
        "two_att": lambda row: first_number(row.get("2pa"), row.get("two_pa"), subtract_numbers(to_float(row.get("fga")), to_float(row.get("tpa")))),
        "two_made": lambda row: first_number(row.get("2pm"), row.get("two_pm"), subtract_numbers(to_float(row.get("fgm")), to_float(row.get("tpm")))),
    },
    "juco": {
        "rim_dir": RIM_ROOT / "JUCO Rim Data",
        "season_parser": lambda file_name: season_from_hyphen_file(file_name),
        "player_column": "player_name",
        "team_column": "team_name",
        "row_key": lambda row: runtime_key("juco", row.get("season"), row.get("team_name"), row.get("player_name")),
        "two_att": lambda row: first_number(row.get("2pa"), row.get("two_pa"), subtract_numbers(to_float(row.get("fga")), to_float(row.get("tpa")))),
        "two_made": lambda row: first_number(row.get("2pm"), row.get("two_pm"), subtract_numbers(to_float(row.get("fgm")), to_float(row.get("tpm")))),
    },
    "fiba": {
        "rim_dirs": [
            (RIM_ROOT / "U16 Americup Rim Data", "u16_americup"),
            (RIM_ROOT / "U17 World Cup Rim Data", "u17_world_cup"),
            (RIM_ROOT / "U18 Americup Rim Data", "u18_americup"),
            (RIM_ROOT / "U18 Euro A Rim Data", "u18_euro_a"),
            (RIM_ROOT / "U18 Euro B Rim Data", "u18_euro_b"),
            (RIM_ROOT / "U19 World Cup Rim Data", "u19_world_cup"),
            (RIM_ROOT / "U20 Euro A RIm Data", "u20_euro_a"),
            (RIM_ROOT / "U20 Euro B Rim Data", "u20_euro_b"),
        ],
        "season_parser": lambda file_name: season_from_national_file(file_name),
        "player_column": "player_name",
        "team_column": "team_name",
        "row_key": lambda row: runtime_key("fiba", row.get("season"), row.get("team_code") or row.get("team_name"), row.get("player_name"), row.get("competition_key")),
        "two_att": lambda row: first_number(row.get("2pa"), row.get("two_pa"), subtract_numbers(to_float(row.get("fga")), to_float(row.get("3pa")))),
        "two_made": lambda row: first_number(row.get("2pm"), row.get("two_pm"), subtract_numbers(to_float(row.get("fgm")), to_float(row.get("3pm")))),
    },
}

TEAM_STATE_TOKENS = {
    "al", "ak", "ar", "az", "ca", "cal", "calif", "co", "colo", "ct", "de", "fl", "fla", "ga", "hi", "ia", "id",
    "il", "ill", "in", "ind", "ks", "kan", "ky", "la", "ma", "md", "me", "mi", "mich", "mn", "mo", "ms", "mt", "nc",
    "nd", "ne", "nev", "nh", "nj", "nm", "ny", "oh", "ok", "okla", "or", "ore", "pa", "ri", "sc", "sd", "tn", "tenn",
    "tx", "ut", "va", "vt", "wa", "wash", "wi", "wisc", "wv", "wy", "indiana", "iowa", "kansas", "kentucky",
    "louisiana", "maryland", "michigan", "missouri", "montana", "nebraska", "ohio", "oklahoma", "oregon",
    "tennessee", "texas", "virginia", "washington", "wisconsin",
}
MASCOT_TOKENS = {
    "aces", "aggies", "anteaters", "aztecs", "bears", "bearcats", "beavers", "bison", "bisons", "blazers", "blue",
    "bluebirds", "bluejays", "bobcats", "bonnies", "braves", "broncos", "bruins", "bulldogs", "bulls", "buccaneers",
    "buckeyes", "camels", "cardinal", "cardinals", "catamounts", "chargers", "chiefs", "chippewas", "colonials",
    "comets", "conference", "cougars", "cowboys", "crimson", "cyclones", "demons", "devils", "dolphins", "dons",
    "dragons", "dukes", "eagles", "explorers", "falcons", "fightin", "fighting", "firebirds", "flames", "flash",
    "foxes", "frogs", "gators", "gaels", "golden", "governors", "grif", "griffins", "grizzlies", "hawks", "huskies",
    "hurricane", "hurricanes", "islanders", "jacks", "jackrabbits", "jaguars", "jayhawks", "keydets", "knights",
    "lancers", "leopards", "lions", "lobos", "marauders", "matadors", "miners", "minutemen", "monarchs",
    "mountaineers", "musketeers", "mustangs", "norse", "oilers", "orange", "ospreys", "owls", "panthers", "patriots",
    "pelicans", "penguins", "pioneers", "pirates", "pride", "purple", "racers", "raiders", "rams", "ravens", "red",
    "redbirds", "redhawks", "redstorm", "rebels", "revolutionaries", "roadrunners", "rockets", "royals", "saints",
    "seminoles", "shockers", "skyhawks", "spartans", "spiders", "storm", "sun", "sycamores", "tars", "terriers",
    "thunderbirds", "tigers", "titans", "tar", "heels", "thundering", "trojans", "tribe", "tulips", "vandals",
    "vikings", "wildcats", "wolves", "wolfpack", "wolverines", "49ers", "badgers", "bearkats", "bengals",
    "billikens", "boilermakers", "broncs", "buffaloes", "cavaliers", "chanticleers", "commodores", "crusaders",
    "deacons", "ducks", "flyers", "friars", "gamecocks", "gauchos", "hatters", "hawkeyes", "hens", "hilltoppers",
    "hoosiers", "hokies", "hoyas", "jackets", "jaspers", "kangaroos", "leathernecks", "lumberjacks", "mastodons",
    "midshipmen", "mocs", "pack", "paladins", "peacocks", "phoenix", "pilots", "rattlers", "retrievers", "runnin",
    "salukis", "screaming", "seahawks", "seawolves", "sharks", "stags", "terrapins", "texans", "tommies", "toreros",
    "trailblazers", "tritons", "utes", "vaqueros", "volunteers", "wave", "waves", "warhawks", "warriors", "zips",
    "illini", "irish", "herd", "antelopes", "cajuns", "colonels", "cornhuskers", "coyotes", "danes", "greyhounds",
    "highlanders", "hornets", "lakers", "longhorns", "mavericks", "privateers", "quakers", "razorbacks", "ramblers",
    "sooners", "rangers",
}
MASCOT_PREFIX_TOKENS = {"big", "black", "fighting", "golden", "great", "lady", "little", "mighty", "purple", "ragin", "red", "scarlet", "silver"}
TEAM_SUFFIX_PATTERNS = [
    r"\bFightin(?:g)?\s+Blue\s+Hens?\b$",
    r"\bBlack\s+Knights?\b$",
    r"\bNittany\s+Lions?\b$",
    r"\bMountain\s+Hawks?\b$",
    r"\bHorned\s+Frogs?\b$",
    r"\bYellow\s+Jackets?\b$",
    r"\bBlue\s+Devils?\b$",
    r"\bBlue\s+Hose\b$",
    r"\bBig\s+Green\b$",
    r"\bGreen\s+Wave\b$",
    r"\bMean\s+Green\b$",
    r"\bRunnin['’]?\s+Bulldogs?\b$",
    r"\bScreaming\s+Eagles?\b$",
    r"\bGolden\s+Gophers?\b$",
    r"\bGolden\s+Flashes?\b$",
    r"\bGolden\s+Eagles?\b$",
    r"\bRed\s+Storm\b$",
    r"\bWolf\s+Pack\b$",
    r"\bCrimson\s+Tide\b$",
    r"\bDemon\s+Deacons?\b$",
]
ACADEMIC_SUFFIX_PATTERNS = [
    r"\bCommunity\s+and\s+Technical\s+College\b$",
    r"\bTechnical\s+and\s+Community\s+College\b$",
    r"\bCommunity\s+and\s+Technical\b$",
    r"\bTechnical\s+and\s+Community\b$",
    r"\bTechnical\s*&\s*CC\b$",
    r"\bTechnical\s+CC\b$",
    r"\bCommunity\s+College\b$",
    r"\bJunior\s+College\b$",
    r"\bTechnical\s+College\b$",
    r"\bState\s+College\b$",
    r"\bCollege\b$",
    r"\bCC\b$",
]

FIBA_CODE_MAP = {
    "USA": "United States of America",
    "GBR": "Great Britain",
    "CZE": "Czech Republic",
    "KOR": "South Korea",
    "TUR": "Turkey",
    "NED": "Netherlands",
    "RSA": "South Africa",
    "UAE": "United Arab Emirates",
}

NBA_TEAM_CODE_ALIASES = {
    "CHH": "CHA",
    "NJN": "BKN",
    "NOH": "NOP",
    "NOK": "NOP",
    "SEA": "OKC",
    "VAN": "MEM",
    "WSB": "WAS",
    "PHO": "PHX",
    "SAN": "SAS",
}

US_STATE_ABBREVIATIONS = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "district of columbia": "DC",
    "florida": "FL",
    "georgia": "GA",
    "hawaii": "HI",
    "idaho": "ID",
    "illinois": "IL",
    "indiana": "IN",
    "iowa": "IA",
    "kansas": "KS",
    "kentucky": "KY",
    "louisiana": "LA",
    "maine": "ME",
    "maryland": "MD",
    "massachusetts": "MA",
    "michigan": "MI",
    "minnesota": "MN",
    "mississippi": "MS",
    "missouri": "MO",
    "montana": "MT",
    "nebraska": "NE",
    "nevada": "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    "ohio": "OH",
    "oklahoma": "OK",
    "oregon": "OR",
    "pennsylvania": "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    "tennessee": "TN",
    "texas": "TX",
    "utah": "UT",
    "vermont": "VT",
    "virginia": "VA",
    "washington": "WA",
    "west virginia": "WV",
    "wisconsin": "WI",
    "wyoming": "WY",
}
US_STATE_CODES = set(US_STATE_ABBREVIATIONS.values())
TEAM_STATE_CODE_TO_NAME = {code.lower(): name for name, code in US_STATE_ABBREVIATIONS.items()}
EXPLICIT_SCHOOL_KEY_VARIANTS = {
    "arkansas pine bluff": ["uapb", "arkansas pine bluff"],
    "cal poly": ["cal poly slo", "california polytechnic state", "california polytechnic state san luis obispo"],
    "cal poly slo": ["cal poly", "california polytechnic state", "california polytechnic state san luis obispo"],
    "california baptist": ["cal baptist"],
    "connecticut": ["uconn"],
    "east texas a m": ["texas a m commerce", "texas am commerce"],
    "louisiana monroe": ["louisiana monroe", "ulm"],
    "louisiana lafayette": ["ul lafayette", "louisiana"],
    "massachusetts lowell": ["umass lowell"],
    "north carolina asheville": ["unc asheville", "unca"],
    "north carolina wilmington": ["unc wilmington", "uncw"],
    "queens": ["queens nc", "queens university", "queens university of charlotte"],
    "saint francis pa": ["st francis pa", "saint francis pennsylvania", "st francis pennsylvania"],
    "southern miss": ["southern mississippi"],
    "st thomas": ["saint thomas", "st thomas mn", "saint thomas mn", "st thomas minnesota", "saint thomas minnesota"],
    "st thomas mn": ["st thomas", "saint thomas", "st thomas minnesota", "saint thomas minnesota"],
    "texas rio grande valley": ["ut rio grande valley", "utrgv"],
    "texas a m commerce": ["east texas a m", "texas am commerce"],
    "uconn": ["connecticut"],
    "ulm": ["louisiana monroe"],
    "unc asheville": ["north carolina asheville", "unca"],
    "unc wilmington": ["north carolina wilmington", "uncw"],
    "unca": ["north carolina asheville", "unc asheville"],
    "uncw": ["north carolina wilmington", "unc wilmington"],
    "ut rio grande valley": ["texas rio grande valley", "utrgv"],
    "utah tech": ["dixie state", "dixie state utah"],
    "utrgv": ["texas rio grande valley", "ut rio grande valley"],
    "vcu": ["virginia commonwealth"],
    "virginia commonwealth": ["vcu"],
}


def main() -> None:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)

    site_data = load_site_datasets()
    site_team_records = build_site_team_records(site_data)
    team_alias_map, team_alias_details = seed_site_team_aliases(site_team_records)

    profiles, college_index, intl_index, player_name_index = load_realgm_profiles()
    barttorvik_alias_count = add_barttorvik_aliases(team_alias_map, team_alias_details, site_team_records)

    college_summary = match_college_groups(site_data, profiles, college_index, team_alias_map)
    nba_summary = match_nba_groups(site_data["nba"]["rows"], profiles, player_name_index)
    fiba_summary = match_fiba_groups(site_data["fiba"]["rows"], profiles, player_name_index)
    d1_link_summary = link_lower_levels_to_d1(site_data)
    d1_cross_level_summary = link_unmatched_d1_groups_to_existing_anchors(site_data)
    d1_profile_summary = match_unmatched_d1_groups_to_profiles(site_data, college_index, player_name_index, team_alias_map)
    d1_link_reconcile_summary = reconcile_d1_linked_groups(site_data)

    apply_fallback_identity(site_data)
    finalize_row_identity_fields(site_data, profiles)
    add_realgm_team_aliases_from_matches(site_data, team_alias_map, team_alias_details)

    rim_summary = apply_rim_data(site_data, team_alias_map, team_alias_details)
    finalize_row_identity_fields(site_data, profiles)

    grassroots_rows, grassroots_summary = load_and_match_grassroots_rows(player_name_index)

    player_profiles = build_player_profiles(site_data, profiles, grassroots_rows)
    player_career_rows = build_player_career_rows(site_data, player_profiles, grassroots_rows)

    write_rewritten_site_bundles(site_data)
    write_outputs(player_profiles, player_career_rows, team_alias_map, team_alias_details, site_data, profiles, {
        "college_match_summary": college_summary,
        "nba_match_summary": nba_summary,
        "fiba_match_summary": fiba_summary,
        "d1_link_summary": d1_link_summary,
        "d1_cross_level_summary": d1_cross_level_summary,
        "d1_profile_summary": d1_profile_summary,
        "d1_link_reconcile_summary": d1_link_reconcile_summary,
        "grassroots_match_summary": grassroots_summary,
        "rim_match_summary": rim_summary,
        "barttorvik_aliases_added": barttorvik_alias_count,
    })

    print(json.dumps({
        "profiles": len(player_profiles),
        "player_career_rows": len(player_career_rows),
        "college_match_summary": college_summary,
        "nba_match_summary": nba_summary,
        "fiba_match_summary": fiba_summary,
        "d1_link_summary": d1_link_summary,
        "d1_profile_summary": d1_profile_summary,
        "d1_link_reconcile_summary": d1_link_reconcile_summary,
        "grassroots_match_summary": grassroots_summary,
        "rim_match_summary": rim_summary,
        "barttorvik_aliases_added": barttorvik_alias_count,
    }, indent=2))


def load_site_datasets() -> dict[str, dict[str, object]]:
    site_data: dict[str, dict[str, object]] = {}
    for dataset_id, config in SITE_DATASETS.items():
        rows, columns = load_js_csv_rows(config["path"], config["global_name"])
        filtered_rows = []
        for row in rows:
            annotate_site_row(dataset_id, row, config)
            if not is_valid_player_name(row.get("_player_name")):
                continue
            filtered_rows.append(row)
        filtered_rows = dedupe_site_rows(dataset_id, filtered_rows, config)
        site_data[dataset_id] = {
            "config": config,
            "rows": filtered_rows,
            "columns": columns,
        }
    return site_data


def dedupe_site_rows(dataset_id: str, rows: list[dict[str, object]], config: dict[str, object]) -> list[dict[str, object]]:
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        season = clean_text(row.get("season"))
        player_key = normalize_key(row.get("_player_name") or row.get(config["player_column"]))
        team_key = normalize_key(row.get("_team_name") or row.get(config["team_column"]))
        competition_key = clean_text(row.get("competition_key"))
        if not season or not player_key:
            continue
        grouped["|".join([dataset_id, season, competition_key, team_key, player_key])].append(row)

    deduped_rows: list[dict[str, object]] = []
    for group in grouped.values():
        if len(group) == 1:
            deduped_rows.append(group[0])
            continue
        ordered_group = sorted(group, key=site_row_priority, reverse=True)
        merged = dict(ordered_group[0])
        for candidate in ordered_group[1:]:
            merge_site_row_values(merged, candidate)
        annotate_site_row(dataset_id, merged, config)
        deduped_rows.append(merged)
    return deduped_rows


def site_row_priority(row: dict[str, object]) -> float:
    score = float(count_non_blank_fields(row))
    score += first_number(row.get("min"), row.get("mp"), 0) or 0
    score += (first_number(row.get("gp"), row.get("g"), 0) or 0) * 5
    if clean_text(row.get("_source_player_id")):
        score += 25
    if clean_text(row.get("_realgm_player_id")):
        score += 20
    return score


def merge_site_row_values(target: dict[str, object], candidate: dict[str, object]) -> None:
    for column, value in candidate.items():
        if column.startswith("_"):
            continue
        if has_row_value(target.get(column)) or not has_row_value(value):
            continue
        target[column] = value


def has_row_value(value: object) -> bool:
    if value is None or value == "":
        return False
    if isinstance(value, float):
        return not math.isnan(value)
    return True


def annotate_site_row(dataset_id: str, row: dict[str, object], config: dict[str, object]) -> None:
    player_name = clean_display_name(row.get(config["player_column"]))
    team_name = clean_text(row.get(config["team_column"]))
    team_display = clean_text(row.get(config["team_display_column"]) or team_name)
    if dataset_id == "nba" and not team_display:
        team_display = clean_text(row.get("team_alias") or team_name)
    season_value = clean_text(row.get("season"))
    row["_dataset_id"] = dataset_id
    row["_player_name"] = player_name
    row["_team_name"] = team_name
    row["_team_display"] = team_display
    row["_season_start"] = get_site_season_start(dataset_id, season_value)
    row["_name_key"] = normalize_name_key(player_name)
    row["_loose_name_key"] = normalize_loose_name_key(player_name)
    row["_team_keys"] = build_row_team_keys(dataset_id, row, team_alias_map=None)
    row["_source_player_id"] = clean_text(row.get("player_id") or row.get("pid") or row.get("id"))
    row["_dob_iso"] = parse_date_to_iso(row.get("dob"))
    row["_height_in_value"] = first_number(row.get("height_in"), row.get("inches"), parse_height_to_inches(row.get("height")))
    row["_weight_lb_value"] = first_number(row.get("weight_lb"), row.get("weight"), parse_weight_to_lb(row.get("weight_text")))
    row["_draft_pick_value"] = parse_int_value(row.get("draft_pick"))
    row["_rookie_year_value"] = parse_int_value(row.get("rookie_year"))
    row["_canonical_player_id"] = ""
    row["_realgm_player_id"] = ""
    row["_match_source"] = ""
    row["_identity_group_key"] = build_identity_group_key(dataset_id, row)


def build_site_team_records(site_data: dict[str, dict[str, object]]) -> list[dict[str, object]]:
    grouped: dict[tuple[str, str], dict[str, object]] = {}
    for dataset_id, bundle in site_data.items():
        config = bundle["config"]
        for row in bundle["rows"]:
            canonical_team = clean_text(row.get(config["team_column"]))
            if not canonical_team:
                continue
            key = (dataset_id, normalize_key(canonical_team))
            record = grouped.setdefault(key, {
                "dataset_id": dataset_id,
                "canonical_team_name": canonical_team,
                "profile_level": config["profile_level"],
                "aliases": set(),
            })
            for value in (
                row.get(config["team_column"]),
                row.get(config["team_display_column"]),
                row.get("team_name"),
                row.get("team_full"),
                row.get("team_alias"),
                row.get("team_alias_all"),
            ):
                text = clean_text(value)
                if text:
                    record["aliases"].add(text)
    return list(grouped.values())


def seed_site_team_aliases(site_team_records: list[dict[str, object]]) -> tuple[dict[str, dict[str, object]], dict[str, dict[str, object]]]:
    team_alias_map: dict[str, dict[str, object]] = {}
    team_alias_details: dict[str, dict[str, object]] = {}
    for record in site_team_records:
        canonical_team = record["canonical_team_name"]
        detail = team_alias_details.setdefault(canonical_team, {
            "canonical_team_name": canonical_team,
            "levels": set(),
            "aliases": set(),
            "sources": set(),
        })
        detail["levels"].add(record["profile_level"])
        detail["sources"].add("site")
        for alias in record["aliases"]:
            register_team_alias(team_alias_map, team_alias_details, alias, canonical_team, "site", record["profile_level"], 1.0)
            for school_key in build_school_keys(alias):
                register_team_alias(team_alias_map, team_alias_details, school_key, canonical_team, "site", record["profile_level"], 0.95)
    return team_alias_map, team_alias_details


def load_realgm_profiles() -> tuple[
    dict[str, dict[str, object]],
    dict[tuple[int, str], list[dict[str, object]]],
    dict[str, dict[tuple[int, str], list[dict[str, object]]]],
    dict[str, dict[str, list[dict[str, object]]]],
]:
    reference_summaries = load_realgm_reference_player_summaries()
    players = load_realgm_player_source_rows(reference_summaries)
    season_buckets = load_realgm_reference_season_buckets()
    college_rows = season_buckets.get("college", [])
    intl_rows = season_buckets.get("international", [])
    gleague_rows = season_buckets.get("gleague", [])
    nba_rows = season_buckets.get("nba", [])

    profiles: dict[str, dict[str, object]] = {}
    for player in players:
        realgm_player_id = clean_text(player.get("realgm_player_id"))
        if not realgm_player_id:
            continue
        player_name = clean_display_name(player.get("player_name"))
        profile = {
            "realgm_player_id": realgm_player_id,
            "canonical_player_id": f"rgm_{realgm_player_id}",
            "player_name": player_name,
            "display_name": clean_text(player.get("display_name")) or player_name,
            "born_iso": parse_date_to_iso(player.get("born")),
            "height_in": parse_height_to_inches(player.get("height")),
            "weight_lb": parse_weight_to_lb(player.get("weight")),
            "nationality": clean_text(player.get("nationality")),
            "high_school": clean_text(player.get("high_school")),
            "hometown": clean_text(player.get("hometown")),
            "position": clean_text(player.get("position")),
            "pre_draft_team": clean_text(player.get("pre_draft_team")),
            "current_team": clean_text(player.get("current_team")),
            "current_nba_status": clean_text(player.get("current_nba_status")),
            "summary_url": clean_text(player.get("summary_url")),
            "name_key": normalize_name_key(player_name),
            "loose_name_key": normalize_loose_name_key(player_name),
            "college_seasons": [],
            "intl_seasons": [],
            "gleague_seasons": [],
            "nba_seasons": [],
            "professional_seasons": [],
            "matched_site_groups": set(),
        }
        profiles[realgm_player_id] = profile

    for summary in reference_summaries.values():
        realgm_player_id = clean_text(summary.get("realgm_player_id"))
        if not realgm_player_id:
            continue
        profile = ensure_realgm_profile_entry(
            profiles,
            realgm_player_id,
            summary.get("player_name"),
            summary.get("summary_url"),
        )
        if clean_text(summary.get("summary_url")) and not clean_text(profile.get("summary_url")):
            profile["summary_url"] = clean_text(summary.get("summary_url"))

    college_index: dict[tuple[int, str], list[dict[str, object]]] = defaultdict(list)
    intl_index: dict[str, dict[tuple[int, str], list[dict[str, object]]]] = {
        "strict": defaultdict(list),
        "loose": defaultdict(list),
    }
    player_name_index: dict[str, dict[str, list[dict[str, object]]]] = {
        "strict": defaultdict(list),
        "loose": defaultdict(list),
    }

    for profile in profiles.values():
        if profile["name_key"]:
            player_name_index["strict"][profile["name_key"]].append(profile)
        if profile["loose_name_key"]:
            player_name_index["loose"][profile["loose_name_key"]].append(profile)

    for season_row in college_rows:
        realgm_player_id = clean_text(season_row.get("realgm_player_id"))
        profile = ensure_realgm_profile_entry(profiles, realgm_player_id, season_row.get("player_name"), season_row.get("summary_url"))
        player_name = clean_display_name(season_row.get("player_name")) or profile["player_name"]
        season_start = extract_leading_year(season_row.get("season"))
        school = clean_text(season_row.get("school") or season_row.get("team") or season_row.get("league"))
        entry = {
            "realgm_player_id": realgm_player_id,
            "player_name": player_name,
            "season": clean_text(season_row.get("season")),
            "season_start": season_start,
            "school": school,
            "team_keys": build_school_keys(school),
            "name_key": normalize_name_key(player_name),
            "loose_name_key": normalize_loose_name_key(player_name),
            "profile": profile,
            "source": "realgm_college",
            "stats": dict(season_row),
        }
        profile["college_seasons"].append(entry)
        if season_start and entry["name_key"]:
            college_index[(season_start, entry["name_key"])].append(entry)
        if season_start and entry["loose_name_key"]:
            college_index[(season_start, entry["loose_name_key"])].append(entry)

    for season_row in intl_rows:
        realgm_player_id = clean_text(season_row.get("realgm_player_id"))
        profile = ensure_realgm_profile_entry(profiles, realgm_player_id, season_row.get("player_name"), season_row.get("summary_url"))
        player_name = clean_display_name(season_row.get("player_name")) or profile["player_name"]
        season_start = extract_leading_year(season_row.get("season"))
        team = clean_text(season_row.get("team") or season_row.get("school"))
        entry = {
            "realgm_player_id": realgm_player_id,
            "player_name": player_name,
            "season": clean_text(season_row.get("season")),
            "season_start": season_start,
            "team": team,
            "league": clean_text(season_row.get("league")),
            "team_keys": build_school_keys(team),
            "name_key": normalize_name_key(player_name),
            "loose_name_key": normalize_loose_name_key(player_name),
            "profile": profile,
            "source": "realgm_international",
            "stats": dict(season_row),
        }
        profile["intl_seasons"].append(entry)
        profile["professional_seasons"].append(entry)
        if season_start and entry["name_key"]:
            intl_index["strict"][(season_start, entry["name_key"])].append(entry)
        if season_start and entry["loose_name_key"]:
            intl_index["loose"][(season_start, entry["loose_name_key"])].append(entry)

    for family_rows, source_name, target_key in (
        (gleague_rows, "realgm_gleague", "gleague_seasons"),
        (nba_rows, "realgm_nba", "nba_seasons"),
    ):
        for season_row in family_rows:
            realgm_player_id = clean_text(season_row.get("realgm_player_id"))
            profile = ensure_realgm_profile_entry(profiles, realgm_player_id, season_row.get("player_name"), season_row.get("summary_url"))
            player_name = clean_display_name(season_row.get("player_name")) or profile["player_name"]
            entry = {
                "realgm_player_id": realgm_player_id,
                "player_name": player_name,
                "season": clean_text(season_row.get("season")),
                "season_start": extract_leading_year(season_row.get("season")),
                "team": clean_text(season_row.get("team") or season_row.get("school") or season_row.get("league")),
                "league": clean_text(season_row.get("league")),
                "team_keys": build_school_keys(season_row.get("team") or season_row.get("school") or season_row.get("league")),
                "name_key": normalize_name_key(player_name),
                "loose_name_key": normalize_loose_name_key(player_name),
                "profile": profile,
                "source": source_name,
                "stats": dict(season_row),
            }
            profile[target_key].append(entry)
            profile["professional_seasons"].append(entry)

    return profiles, college_index, intl_index, player_name_index


def load_realgm_reference_player_summaries() -> dict[str, dict[str, object]]:
    summaries: dict[str, dict[str, object]] = {}
    if not REALGM_REFERENCE_PLAYERS_PATH.is_file():
        return summaries
    with REALGM_REFERENCE_PLAYERS_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            realgm_player_id = clean_text(row.get("realgm_player_id"))
            if not realgm_player_id:
                continue
            summaries[realgm_player_id] = dict(row)
    return summaries


def get_realgm_player_source_paths() -> list[Path]:
    paths: list[Path] = []
    for path in [REALGM_NBA_ROOT / "players.csv"]:
        if path.is_file():
            paths.append(path)
    for path in get_realgm_source_paths():
        if path.name == "players.csv":
            paths.append(path)
    seen: set[Path] = set()
    ordered: list[Path] = []
    for path in paths:
        if path in seen:
            continue
        seen.add(path)
        ordered.append(path)
    return ordered


def load_realgm_player_source_rows(reference_summaries: dict[str, dict[str, object]]) -> list[dict[str, object]]:
    merged: dict[str, dict[str, object]] = {}
    for path in get_realgm_player_source_paths():
        for row in load_plain_csv_rows(path):
            realgm_player_id = clean_text(row.get("realgm_player_id"))
            if not realgm_player_id:
                continue
            current = merged.get(realgm_player_id)
            if current is None or count_non_blank_fields(row) > count_non_blank_fields(current):
                merged[realgm_player_id] = row
    for realgm_player_id, summary in reference_summaries.items():
        current = merged.setdefault(realgm_player_id, {
            "realgm_player_id": realgm_player_id,
            "player_name": clean_text(summary.get("player_name")),
            "summary_url": clean_text(summary.get("summary_url")),
        })
        if clean_text(summary.get("player_name")) and not clean_text(current.get("player_name")):
            current["player_name"] = clean_text(summary.get("player_name"))
        if clean_text(summary.get("summary_url")) and not clean_text(current.get("summary_url")):
            current["summary_url"] = clean_text(summary.get("summary_url"))
    return list(merged.values())


def ensure_realgm_profile_entry(
    profiles: dict[str, dict[str, object]],
    realgm_player_id: str,
    player_name: object = "",
    summary_url: object = "",
) -> dict[str, object]:
    profile = profiles.get(realgm_player_id)
    player_name_text = clean_display_name(player_name)
    summary_url_text = clean_text(summary_url)
    if profile is None:
        profile = {
            "realgm_player_id": realgm_player_id,
            "canonical_player_id": f"rgm_{realgm_player_id}",
            "player_name": player_name_text,
            "display_name": player_name_text,
            "born_iso": "",
            "height_in": "",
            "weight_lb": "",
            "nationality": "",
            "high_school": "",
            "hometown": "",
            "position": "",
            "pre_draft_team": "",
            "current_team": "",
            "current_nba_status": "",
            "summary_url": summary_url_text,
            "name_key": normalize_name_key(player_name_text),
            "loose_name_key": normalize_loose_name_key(player_name_text),
            "college_seasons": [],
            "intl_seasons": [],
            "gleague_seasons": [],
            "nba_seasons": [],
            "professional_seasons": [],
            "matched_site_groups": set(),
        }
        profiles[realgm_player_id] = profile
        return profile

    preferred_name = pick_preferred_name(profile.get("player_name"), player_name_text)
    if preferred_name and preferred_name != profile.get("player_name"):
        profile["player_name"] = preferred_name
        profile["display_name"] = preferred_name
        profile["name_key"] = normalize_name_key(preferred_name)
        profile["loose_name_key"] = normalize_loose_name_key(preferred_name)
    if summary_url_text and not clean_text(profile.get("summary_url")):
        profile["summary_url"] = summary_url_text
    return profile


def load_realgm_reference_season_buckets() -> dict[str, list[dict[str, object]]]:
    buckets: dict[str, list[dict[str, object]]] = defaultdict(list)
    merged_rows: dict[tuple[str, str, str, str, str], dict[str, object]] = {}
    if REALGM_REFERENCE_ROWS_PATH.is_file():
        with REALGM_REFERENCE_ROWS_PATH.open("r", encoding="utf-8", newline="", errors="ignore") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                realgm_player_id = clean_text(row.get("realgm_player_id"))
                if not realgm_player_id:
                    continue
                family = normalize_realgm_reference_family(row)
                if not family or not is_realgm_reference_regular_season_row(row):
                    continue
                key = build_realgm_reference_season_key(realgm_player_id, family, row)
                if not any(key):
                    continue
                normalized = dict(row)
                normalized["_reference_family"] = family
                current = merged_rows.get(key)
                merged_rows[key] = merge_realgm_reference_rows(current, normalized) if current else normalized

    for row in load_realgm_csv_rows("player_seasons.csv"):
        realgm_player_id = clean_text(row.get("realgm_player_id"))
        if not realgm_player_id:
            continue
        out = dict(row)
        out["_reference_family"] = "college"
        key = build_realgm_reference_season_key(realgm_player_id, "college", out)
        if not any(key):
            continue
        current = merged_rows.get(key)
        merged_rows[key] = merge_realgm_reference_rows(current, out) if current else out
    for row in load_realgm_csv_rows("international_player_seasons.csv"):
        realgm_player_id = clean_text(row.get("realgm_player_id"))
        if not realgm_player_id:
            continue
        out = dict(row)
        out["_reference_family"] = "international"
        key = build_realgm_reference_season_key(realgm_player_id, "international", out)
        if not any(key):
            continue
        current = merged_rows.get(key)
        merged_rows[key] = merge_realgm_reference_rows(current, out) if current else out

    for row in merged_rows.values():
        buckets[clean_text(row.get("_reference_family"))].append(row)
    return buckets


def normalize_realgm_reference_family(value: object) -> str:
    candidates: list[str] = []
    if isinstance(value, dict):
        candidates.extend([
            clean_text(value.get("source_family")),
            clean_text(value.get("career_family")),
            clean_text(value.get("stats_scope")),
            clean_text(value.get("source_dataset")),
            clean_text(value.get("source_file")),
            clean_text(value.get("source_table")),
            clean_text(value.get("table_kind")),
        ])
    else:
        candidates.append(clean_text(value))

    normalized = {normalize_key(candidate) for candidate in candidates if clean_text(candidate)}
    if normalized & {"international", "fiba", "international summary", "international player seasons csv"}:
        return "international"
    if normalized & {"gleague", "g league", "gleague crawl", "g league crawl"}:
        return "gleague"
    if normalized & {"nba", "nba crawl", "nba totals csv", "nba advanced csv"}:
        return "nba"
    if normalized & {"college", "ncaa", "college crawl", "player seasons csv", "season summary"}:
        return "college"
    return ""


def is_realgm_reference_regular_season_row(row: dict[str, object]) -> bool:
    source_table = normalize_key(row.get("source_table") or row.get("table_kind"))
    if source_table and source_table not in {
        "totals",
        "advanced",
        "season summary",
        "international summary",
        "player seasons csv",
        "international player seasons csv",
    }:
        return False
    section = clean_text(row.get("section_path")).lower()
    if not section:
        return True
    if any(token in section for token in ("playoff", "preseason", "summer league", "all-star", "all star")):
        return False
    return ("regular season" in section) or ("season stats" in section)


def build_realgm_reference_season_key(realgm_player_id: str, family: str, row: dict[str, object]) -> tuple[str, str, str, str, str]:
    season = canonical_season_label(row.get("season"))
    team_name = clean_text(row.get("school") if family == "college" else row.get("team") or row.get("school") or row.get("league"))
    league = clean_text(row.get("league"))
    return (
        clean_text(realgm_player_id),
        clean_text(family),
        clean_text(season),
        normalize_key(team_name),
        normalize_key(league),
    )


def merge_realgm_reference_rows(existing: dict[str, object] | None, candidate: dict[str, object]) -> dict[str, object]:
    if existing is None:
        return candidate
    preferred = existing if realgm_reference_row_priority(existing) >= realgm_reference_row_priority(candidate) else candidate
    secondary = candidate if preferred is existing else existing
    merged = dict(preferred)
    for column, value in secondary.items():
        if column.startswith("_"):
            continue
        if not has_row_value(merged.get(column)) and has_row_value(value):
            merged[column] = value
    merged["_reference_family"] = clean_text(preferred.get("_reference_family") or secondary.get("_reference_family"))
    return merged


def realgm_reference_row_priority(row: dict[str, object]) -> float:
    score = float(count_non_blank_fields(row))
    source_table = normalize_key(row.get("source_table") or row.get("table_kind"))
    if source_table == "totals":
        score += 300.0
    elif source_table == "advanced":
        score += 180.0
    if is_realgm_reference_counting_totals_row(row):
        score -= 60.0
    else:
        score += 40.0
    return score


def is_realgm_reference_counting_totals_row(row: dict[str, object]) -> bool:
    if normalize_key(row.get("source_table") or row.get("table_kind")) != "totals":
        return False
    min_text = clean_text(row.get("min"))
    if "," in min_text:
        return True
    for column, threshold in (
        ("min", 80.0),
        ("pts", 80.0),
        ("fgm", 25.0),
        ("fga", 50.0),
        ("reb", 25.0),
        ("trb", 25.0),
        ("ast", 18.0),
        ("off", 15.0),
        ("def", 25.0),
        ("3pa", 18.0),
        ("fta", 20.0),
    ):
        numeric = to_float(row.get(column))
        if numeric is not None and numeric > threshold:
            return True
    return False


def add_barttorvik_aliases(team_alias_map: dict[str, dict[str, object]], team_alias_details: dict[str, dict[str, object]], site_team_records: list[dict[str, object]]) -> int:
    files = sorted(BARTTORVIK_DIR.glob("advstats_*.json"))
    if not files:
        return 0
    d1_records = [record for record in site_team_records if record["dataset_id"] == "d1"]
    if not d1_records:
        return 0
    bart_teams = set()
    for path in files:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        for row in payload:
            if isinstance(row, list) and len(row) > 1:
                team = clean_text(row[1])
                if team:
                    bart_teams.add(team)
    added = 0
    for team in sorted(bart_teams):
        best_record = None
        best_score = 0.0
        second_score = 0.0
        team_keys = build_school_keys(team)
        for record in d1_records:
            score = score_team_key_sets(team_keys, build_school_keys(record["canonical_team_name"]))
            if score > best_score:
                second_score = best_score
                best_score = score
                best_record = record
            elif score > second_score:
                second_score = score
        if not best_record:
            continue
        if best_score < 0.82 or (best_score - second_score) < 0.12:
            continue
        register_team_alias(team_alias_map, team_alias_details, team, best_record["canonical_team_name"], "barttorvik", "D1", 0.9)
        added += 1
    return added


def match_college_groups(site_data: dict[str, dict[str, object]], profiles: dict[str, dict[str, object]], college_index: dict[tuple[int, str], list[dict[str, object]]], team_alias_map: dict[str, dict[str, object]]) -> dict[str, dict[str, int]]:
    summary: dict[str, dict[str, int]] = {}
    for dataset_id in ("d1", "d2", "naia", "juco"):
        rows = site_data[dataset_id]["rows"]
        groups = group_rows_by_identity(rows)
        matched = 0
        unmatched = 0
        ambiguous = 0
        for group_rows in groups:
            result = choose_best_college_profile(group_rows, college_index, team_alias_map)
            if result["status"] == "matched":
                matched += 1
                assign_profile_to_group(group_rows, result["profile"], result["source"])
                result["profile"]["matched_site_groups"].add(group_rows[0]["_identity_group_key"])
            elif result["status"] == "ambiguous":
                ambiguous += 1
            else:
                unmatched += 1
        summary[dataset_id] = {"groups": len(groups), "matched": matched, "ambiguous": ambiguous, "unmatched": unmatched}
    return summary


def choose_best_college_profile(group_rows: list[dict[str, object]], college_index: dict[tuple[int, str], list[dict[str, object]]], team_alias_map: dict[str, dict[str, object]]) -> dict[str, object]:
    profile_scores: dict[str, dict[str, object]] = {}
    for row in sorted(group_rows, key=identity_row_score, reverse=True):
        if not row.get("_season_start") or not row.get("_name_key"):
            continue
        candidate_pool = []
        for key in {row.get("_name_key"), row.get("_loose_name_key")}:
            if key:
                candidate_pool.extend(college_index.get((row["_season_start"], key), []))
        seen = set()
        for candidate in candidate_pool:
            profile = candidate["profile"]
            profile_id = profile["realgm_player_id"]
            candidate_key = (profile_id, candidate["season"], candidate["school"])
            if candidate_key in seen:
                continue
            seen.add(candidate_key)
            score = score_college_candidate(row, candidate, team_alias_map)
            if score <= 0:
                continue
            entry = profile_scores.setdefault(profile_id, {
                "profile": profile,
                "score": 0.0,
                "best_score": 0.0,
                "row_hits": set(),
            })
            entry["score"] += score
            entry["best_score"] = max(entry["best_score"], score)
            entry["row_hits"].add(row_identity_key(row))
    if not profile_scores:
        return {"status": "unmatched"}

    ranked = sorted(
        profile_scores.values(),
        key=lambda item: (item["score"] + (len(item["row_hits"]) * 18), item["best_score"]),
        reverse=True,
    )
    best = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    margin = (best["score"] - second["score"]) if second else 999.0
    if best["best_score"] < 85 or margin < 18:
        return {"status": "ambiguous"}
    return {"status": "matched", "profile": best["profile"], "source": "realgm_college"}


def score_college_candidate(row: dict[str, object], candidate: dict[str, object], team_alias_map: dict[str, dict[str, object]]) -> float:
    row_name = row.get("_name_key")
    cand_name = candidate.get("name_key")
    row_loose = row.get("_loose_name_key")
    cand_loose = candidate.get("loose_name_key")
    if not row_name:
        return 0.0
    if row_name == cand_name:
        name_score = 35.0
    elif row_loose and row_loose == cand_loose:
        name_score = 26.0
    else:
        return 0.0

    row_team_keys = build_row_team_keys(row["_dataset_id"], row, team_alias_map)
    team_score = score_team_key_sets(row_team_keys, candidate.get("team_keys") or [])
    if team_score < 0.5:
        return 0.0
    if team_score >= 0.99:
        total = 85.0
    elif team_score >= 0.82:
        total = 74.0
    elif team_score >= 0.66:
        total = 60.0
    else:
        total = 48.0
    total += name_score

    row_dob = row.get("_dob_iso")
    profile_dob = candidate["profile"].get("born_iso")
    if row_dob and profile_dob:
        if row_dob != profile_dob:
            return 0.0
        total += 45.0

    height_gap = abs_numeric_gap(positive_number(row.get("_height_in_value")), positive_number(candidate["profile"].get("height_in")))
    if math.isfinite(height_gap):
        if height_gap > 3:
            return 0.0
        if height_gap <= 1:
            total += 18.0
        elif height_gap <= 2:
            total += 10.0
        else:
            total += 4.0

    if row["_dataset_id"] == "d1" and row.get("_draft_pick_value") is not None:
        total += 8.0
        if compare_team_strings(row.get("_team_name"), candidate["profile"].get("pre_draft_team"), team_alias_map):
            total += 12.0

    return total


def match_nba_groups(rows: list[dict[str, object]], profiles: dict[str, dict[str, object]], player_name_index: dict[str, dict[str, list[dict[str, object]]]]) -> dict[str, int]:
    groups = group_rows_by_identity(rows)
    matched = 0
    ambiguous = 0
    unmatched = 0
    profiles_by_canonical = {profile["canonical_player_id"]: profile for profile in profiles.values()}

    for group_rows in groups:
        result = choose_best_nba_profile(group_rows, profiles_by_canonical, player_name_index)
        if result["status"] == "matched":
            matched += 1
            assign_profile_to_group(group_rows, result["profile"], result["source"])
            result["profile"]["matched_site_groups"].add(group_rows[0]["_identity_group_key"])
        elif result["status"] == "ambiguous":
            ambiguous += 1
        else:
            unmatched += 1
    return {"groups": len(groups), "matched": matched, "ambiguous": ambiguous, "unmatched": unmatched}


def choose_best_nba_profile(group_rows: list[dict[str, object]], profiles_by_canonical: dict[str, dict[str, object]], player_name_index: dict[str, dict[str, list[dict[str, object]]]]) -> dict[str, object]:
    profile_scores: dict[str, dict[str, object]] = {}
    representative = sorted(group_rows, key=identity_row_score, reverse=True)[0]

    for existing_canonical_id in {clean_text(row.get("_canonical_player_id")) for row in group_rows if row.get("_canonical_player_id")}:
        profile = profiles_by_canonical.get(existing_canonical_id)
        if not profile:
            continue
        score = score_nba_profile(representative, profile, prefer_existing=True)
        if score <= 0:
            continue
        profile_scores[profile["realgm_player_id"]] = {"profile": profile, "score": score, "best_score": score}

    candidate_pool = []
    for key in {representative.get("_name_key"), representative.get("_loose_name_key")}:
        if key:
            candidate_pool.extend(player_name_index["strict"].get(key, []))
            candidate_pool.extend(player_name_index["loose"].get(key, []))
    seen = set()
    for profile in candidate_pool:
        profile_id = profile["realgm_player_id"]
        if profile_id in seen:
            continue
        seen.add(profile_id)
        score = score_nba_profile(representative, profile, prefer_existing=False)
        if score <= 0:
            continue
        current = profile_scores.get(profile_id)
        if not current or score > current["score"]:
            profile_scores[profile_id] = {"profile": profile, "score": score, "best_score": score}

    if not profile_scores:
        return {"status": "unmatched"}

    ranked = sorted(profile_scores.values(), key=lambda item: item["score"], reverse=True)
    best = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    margin = (best["score"] - second["score"]) if second else 999.0
    if best["score"] < 78 or margin < 12:
        return {"status": "ambiguous"}
    return {"status": "matched", "profile": best["profile"], "source": "realgm_nba"}


def score_nba_profile(row: dict[str, object], profile: dict[str, object], prefer_existing: bool) -> float:
    if row.get("_name_key") == profile.get("name_key"):
        total = 40.0
    elif row.get("_loose_name_key") and row.get("_loose_name_key") == profile.get("loose_name_key"):
        total = 28.0
    else:
        return 0.0

    if prefer_existing:
        total += 24.0

    height_gap = abs_numeric_gap(positive_number(row.get("_height_in_value")), positive_number(profile.get("height_in")))
    if math.isfinite(height_gap):
        if height_gap > 3:
            return 0.0
        if height_gap <= 1:
            total += 22.0
        elif height_gap <= 2:
            total += 12.0
        else:
            total += 6.0

    weight_gap = abs_numeric_gap(positive_number(row.get("_weight_lb_value")), positive_number(profile.get("weight_lb")))
    if math.isfinite(weight_gap):
        if weight_gap > 40:
            total -= 10.0
        elif weight_gap <= 10:
            total += 10.0
        elif weight_gap <= 20:
            total += 5.0

    if clean_text(profile.get("current_nba_status")):
        total += 6.0
    if clean_text(profile.get("pre_draft_team")):
        total += 3.0
    target_year = canonical_end_year(row.get("season"))
    target_team_keys = row.get("_team_keys") or build_nba_team_keys(
        row.get("team_alias"),
        row.get("_team_name"),
        row.get("team_alias_all"),
        row.get("team_name"),
    )
    if target_year and target_team_keys:
        best_team_score = 0.0
        matched_year = False
        for season_entry in profile.get("nba_seasons") or []:
            if canonical_end_year(season_entry.get("season")) != target_year:
                continue
            matched_year = True
            season_team = clean_text(season_entry.get("team") or season_entry.get("school"))
            season_team_keys = build_nba_team_keys(season_team)
            best_team_score = max(best_team_score, score_team_key_sets(target_team_keys, season_team_keys))
        if matched_year:
            total += 10.0
            if best_team_score >= 0.99:
                total += 28.0
            elif best_team_score >= 0.82:
                total += 20.0
            elif best_team_score >= 0.66:
                total += 12.0
    return total


def match_fiba_groups(rows: list[dict[str, object]], profiles: dict[str, dict[str, object]], player_name_index: dict[str, dict[str, list[dict[str, object]]]]) -> dict[str, int]:
    groups = group_rows_by_identity(rows)
    matched = 0
    ambiguous = 0
    unmatched = 0
    for group_rows in groups:
        result = choose_best_fiba_profile(group_rows, player_name_index)
        if result["status"] == "matched":
            matched += 1
            assign_profile_to_group(group_rows, result["profile"], result["source"])
            result["profile"]["matched_site_groups"].add(group_rows[0]["_identity_group_key"])
        elif result["status"] == "ambiguous":
            ambiguous += 1
        else:
            unmatched += 1
    return {"groups": len(groups), "matched": matched, "ambiguous": ambiguous, "unmatched": unmatched}


def choose_best_fiba_profile(group_rows: list[dict[str, object]], player_name_index: dict[str, dict[str, list[dict[str, object]]]]) -> dict[str, object]:
    profile_scores: dict[str, dict[str, object]] = {}
    for row in sorted(group_rows, key=identity_row_score, reverse=True):
        candidate_pool = []
        for key in {row.get("_name_key"), row.get("_loose_name_key")}:
            if key:
                candidate_pool.extend(player_name_index["strict"].get(key, []))
                candidate_pool.extend(player_name_index["loose"].get(key, []))
        seen = set()
        for profile in candidate_pool:
            profile_id = profile["realgm_player_id"]
            if profile_id in seen:
                continue
            seen.add(profile_id)
            score = score_fiba_profile(row, profile)
            if score <= 0:
                continue
            entry = profile_scores.setdefault(profile_id, {"profile": profile, "score": 0.0, "best_score": 0.0, "row_hits": set()})
            entry["score"] += score
            entry["best_score"] = max(entry["best_score"], score)
            entry["row_hits"].add(row_identity_key(row))

    if not profile_scores:
        return {"status": "unmatched"}

    ranked = sorted(profile_scores.values(), key=lambda item: (item["score"] + (len(item["row_hits"]) * 14), item["best_score"]), reverse=True)
    best = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    margin = (best["score"] - second["score"]) if second else 999.0
    if best["best_score"] < 92 or margin < 14:
        return {"status": "ambiguous"}
    return {"status": "matched", "profile": best["profile"], "source": "realgm_fiba"}


def score_fiba_profile(row: dict[str, object], profile: dict[str, object]) -> float:
    if row.get("_name_key") == profile.get("name_key"):
        total = 36.0
    elif row.get("_loose_name_key") and row.get("_loose_name_key") == profile.get("loose_name_key"):
        total = 26.0
    else:
        return 0.0

    row_dob = row.get("_dob_iso")
    profile_dob = profile.get("born_iso")
    if row_dob and profile_dob:
        if row_dob != profile_dob:
            return 0.0
        total += 58.0
    elif row_dob:
        total += 8.0

    height_gap = abs_numeric_gap(row.get("_height_in_value"), profile.get("height_in"))
    if math.isfinite(height_gap):
        if height_gap > 3:
            return 0.0
        if height_gap <= 1:
            total += 20.0
        elif height_gap <= 2:
            total += 12.0
        else:
            total += 5.0

    nationality = normalize_key(row.get("nationality") or row.get("team_name") or row.get("team_code"))
    profile_nationality = normalize_key(profile.get("nationality"))
    if nationality and profile_nationality and nationality == profile_nationality:
        total += 12.0

    if profile.get("intl_seasons"):
        total += 4.0
    return total


def link_lower_levels_to_d1(site_data: dict[str, dict[str, object]]) -> dict[str, dict[str, int]]:
    d1_groups = group_rows_by_identity(site_data["d1"]["rows"])
    d1_anchors = build_d1_link_anchors(d1_groups)
    if not d1_anchors:
        return {}

    anchors_by_name: dict[str, dict[str, list[dict[str, object]]]] = {
        "strict": defaultdict(list),
        "loose": defaultdict(list),
    }
    for anchor in d1_anchors:
        if anchor["name_key"]:
            anchors_by_name["strict"][anchor["name_key"]].append(anchor)
        if anchor["loose_name_key"]:
            anchors_by_name["loose"][anchor["loose_name_key"]].append(anchor)

    summary: dict[str, dict[str, int]] = {}
    for dataset_id in ("d2", "naia", "juco", "fiba"):
        linked = 0
        ambiguous = 0
        unmatched = 0
        for group_rows in group_rows_by_identity(site_data[dataset_id]["rows"]):
            if clean_text(group_rows[0].get("_canonical_player_id")):
                continue
            result = choose_best_d1_anchor(group_rows, anchors_by_name)
            if result["status"] == "matched":
                linked += 1
                assign_d1_anchor_to_group(group_rows, result["anchor"])
            elif result["status"] == "ambiguous":
                ambiguous += 1
            else:
                unmatched += 1
        summary[dataset_id] = {"linked": linked, "ambiguous": ambiguous, "unmatched": unmatched}
    return summary


def build_site_identity_anchors(
    site_data: dict[str, dict[str, object]],
    dataset_ids: tuple[str, ...] = ("d1", "d2", "naia", "juco", "fiba", "nba"),
) -> list[dict[str, object]]:
    anchors: list[dict[str, object]] = []
    for dataset_id in dataset_ids:
        bundle = site_data.get(dataset_id)
        if not bundle:
            continue
        for group_rows in group_rows_by_identity(bundle["rows"]):
            representative = sorted(group_rows, key=identity_row_score, reverse=True)[0]
            realgm_player_id = clean_text(representative.get("_realgm_player_id"))
            if not realgm_player_id:
                continue
            years = sorted({canonical_end_year(row.get("season")) for row in group_rows if canonical_end_year(row.get("season"))}, reverse=True)
            canonical_id = (
                clean_text(representative.get("_canonical_player_id"))
                or clean_text(representative.get("canonical_player_id"))
                or f"rgm_{realgm_player_id}"
            )
            anchor = {
                "canonical_player_id": canonical_id,
                "realgm_player_id": realgm_player_id,
                "name_key": clean_text(representative.get("_name_key")),
                "loose_name_key": clean_text(representative.get("_loose_name_key")),
                "player_name": clean_text(representative.get("_player_name")),
                "dob": clean_text(representative.get("_dob_iso")),
                "height_in": first_number(representative.get("_height_in_value")),
                "weight_lb": first_number(representative.get("_weight_lb_value")),
                "draft_pick": parse_int_value(representative.get("_draft_pick_value")),
                "min_year": years[-1] if years else 0,
                "max_year": years[0] if years else 0,
                "source_dataset": dataset_id,
            }
            if anchor["name_key"]:
                anchors.append(anchor)
    return anchors


def link_unmatched_d1_groups_to_existing_anchors(site_data: dict[str, dict[str, object]]) -> dict[str, int]:
    anchors = build_site_identity_anchors(site_data)
    if not anchors:
        return {"anchors": 0, "matched": 0, "ambiguous": 0, "unmatched": 0}

    anchors_by_name: dict[str, dict[str, list[dict[str, object]]]] = {
        "strict": defaultdict(list),
        "loose": defaultdict(list),
    }
    for anchor in anchors:
        if anchor["name_key"]:
            anchors_by_name["strict"][anchor["name_key"]].append(anchor)
        if anchor["loose_name_key"]:
            anchors_by_name["loose"][anchor["loose_name_key"]].append(anchor)

    matched = 0
    ambiguous = 0
    unmatched = 0
    for group_rows in group_rows_by_identity(site_data["d1"]["rows"]):
        if clean_text(group_rows[0].get("_realgm_player_id")):
            continue
        result = choose_best_existing_identity_anchor(group_rows, anchors_by_name)
        if result["status"] == "matched":
            matched += 1
            assign_identity_anchor_to_group(group_rows, result["anchor"], "cross_level_anchor")
        elif result["status"] == "ambiguous":
            ambiguous += 1
        else:
            unmatched += 1

    return {"anchors": len(anchors), "matched": matched, "ambiguous": ambiguous, "unmatched": unmatched}


def match_unmatched_d1_groups_to_profiles(
    site_data: dict[str, dict[str, object]],
    college_index: dict[tuple[int, str], list[dict[str, object]]],
    player_name_index: dict[str, dict[str, list[dict[str, object]]]],
    team_alias_map: dict[str, dict[str, object]],
) -> dict[str, int]:
    matched = 0
    ambiguous = 0
    unmatched = 0
    eligible_groups = 0
    college_team_index = build_college_team_season_index(college_index)

    for group_rows in group_rows_by_identity(site_data["d1"]["rows"]):
        if clean_text(group_rows[0].get("_realgm_player_id")):
            continue
        eligible_groups += 1
        result = choose_exact_d1_college_profile(group_rows, college_index, team_alias_map)
        if result["status"] == "unmatched":
            result = choose_fuzzy_d1_team_year_profile(group_rows, college_team_index, team_alias_map)
        if result["status"] == "unmatched":
            result = choose_best_d1_profile(group_rows, player_name_index, team_alias_map)
        if result["status"] == "matched":
            matched += 1
            assign_profile_to_group(group_rows, result["profile"], result["source"])
            result["profile"]["matched_site_groups"].add(group_rows[0]["_identity_group_key"])
        elif result["status"] == "ambiguous":
            ambiguous += 1
        else:
            unmatched += 1

    return {"groups": eligible_groups, "matched": matched, "ambiguous": ambiguous, "unmatched": unmatched}


def choose_exact_d1_college_profile(
    group_rows: list[dict[str, object]],
    college_index: dict[tuple[int, str], list[dict[str, object]]],
    team_alias_map: dict[str, dict[str, object]],
) -> dict[str, object]:
    profile_scores: dict[str, dict[str, object]] = {}
    for row in sorted(group_rows, key=identity_row_score, reverse=True):
        season_start = parse_int_value(row.get("_season_start"))
        if not season_start:
            continue
        row_team_keys = build_row_team_keys("d1", row, team_alias_map)
        if not row_team_keys:
            continue
        candidate_pool: list[tuple[dict[str, object], float]] = []
        strict_key = clean_text(row.get("_name_key"))
        loose_key = clean_text(row.get("_loose_name_key"))
        if strict_key:
            candidate_pool.extend((candidate, 128.0) for candidate in college_index.get((season_start, strict_key), []))
        if loose_key and loose_key != strict_key:
            candidate_pool.extend((candidate, 96.0) for candidate in college_index.get((season_start, loose_key), []))
        seen = set()
        for candidate, base_score in candidate_pool:
            profile = candidate["profile"]
            profile_id = clean_text(profile.get("realgm_player_id"))
            candidate_key = (profile_id, clean_text(candidate.get("season")), clean_text(candidate.get("school")))
            if not profile_id or candidate_key in seen:
                continue
            seen.add(candidate_key)
            team_score = score_team_key_sets(row_team_keys, candidate.get("team_keys") or [])
            if team_score < 0.82:
                continue
            score = base_score
            if team_score >= 0.99:
                score += 42.0
            elif team_score >= 0.9:
                score += 32.0
            else:
                score += 18.0
            entry = profile_scores.setdefault(profile_id, {
                "profile": profile,
                "score": 0.0,
                "best_score": 0.0,
                "row_hits": set(),
            })
            entry["score"] += score
            entry["best_score"] = max(entry["best_score"], score)
            entry["row_hits"].add(row_identity_key(row))

    if not profile_scores:
        return {"status": "unmatched"}

    ranked = sorted(
        profile_scores.values(),
        key=lambda item: (len(item["row_hits"]), item["score"], item["best_score"]),
        reverse=True,
    )
    best = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    best_hits = len(best["row_hits"])
    second_hits = len(second["row_hits"]) if second else 0
    margin = (best["score"] - second["score"]) if second else 999.0
    if best["best_score"] < 114:
        return {"status": "unmatched"}
    if second and best_hits == second_hits and margin < 28:
        return {"status": "ambiguous"}
    return {"status": "matched", "profile": best["profile"], "source": "realgm_college_exact"}


def build_college_team_season_index(
    college_index: dict[tuple[int, str], list[dict[str, object]]],
) -> dict[tuple[int, str], list[dict[str, object]]]:
    index: dict[tuple[int, str], list[dict[str, object]]] = defaultdict(list)
    seen_entries: set[tuple[str, str, str]] = set()
    for entries in college_index.values():
        for entry in entries:
            profile_id = clean_text(entry.get("realgm_player_id") or entry.get("profile", {}).get("realgm_player_id"))
            season_start = parse_int_value(entry.get("season_start"))
            school = clean_text(entry.get("school"))
            if not profile_id or not season_start:
                continue
            dedupe_key = (profile_id, clean_text(entry.get("season")), school)
            if dedupe_key in seen_entries:
                continue
            seen_entries.add(dedupe_key)
            for team_key in entry.get("team_keys") or []:
                if team_key:
                    index[(season_start, team_key)].append(entry)
    return index


def choose_fuzzy_d1_team_year_profile(
    group_rows: list[dict[str, object]],
    college_team_index: dict[tuple[int, str], list[dict[str, object]]],
    team_alias_map: dict[str, dict[str, object]],
) -> dict[str, object]:
    profile_scores: dict[str, dict[str, object]] = {}
    for row in sorted(group_rows, key=identity_row_score, reverse=True):
        season_start = parse_int_value(row.get("_season_start"))
        if not season_start:
            continue
        row_team_keys = build_row_team_keys("d1", row, team_alias_map)
        if not row_team_keys:
            continue
        candidate_pool: dict[tuple[str, str, str], dict[str, object]] = {}
        for team_key in row_team_keys:
            for candidate in college_team_index.get((season_start, team_key), []):
                profile = candidate.get("profile") or {}
                profile_id = clean_text(profile.get("realgm_player_id"))
                candidate_key = (profile_id, clean_text(candidate.get("season")), clean_text(candidate.get("school")))
                if profile_id:
                    candidate_pool[candidate_key] = candidate
        for candidate in candidate_pool.values():
            score = score_fuzzy_d1_team_year_candidate(row, candidate, team_alias_map)
            if score <= 0:
                continue
            profile = candidate["profile"]
            profile_id = clean_text(profile.get("realgm_player_id"))
            entry = profile_scores.setdefault(profile_id, {
                "profile": profile,
                "score": 0.0,
                "best_score": 0.0,
                "row_hits": set(),
            })
            entry["score"] += score
            entry["best_score"] = max(entry["best_score"], score)
            entry["row_hits"].add(row_identity_key(row))

    if not profile_scores:
        return {"status": "unmatched"}

    ranked = sorted(
        profile_scores.values(),
        key=lambda item: (len(item["row_hits"]), item["score"], item["best_score"]),
        reverse=True,
    )
    best = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    margin = (best["score"] - second["score"]) if second else 999.0
    if best["best_score"] < 134:
        return {"status": "unmatched"}
    if second and margin < 16:
        return {"status": "ambiguous"}
    return {"status": "matched", "profile": best["profile"], "source": "realgm_college_fuzzy_team_year"}


def score_fuzzy_d1_team_year_candidate(
    row: dict[str, object],
    candidate: dict[str, object],
    team_alias_map: dict[str, dict[str, object]],
) -> float:
    profile = candidate.get("profile") or {}
    row_team_keys = build_row_team_keys("d1", row, team_alias_map)
    team_score = score_team_key_sets(row_team_keys, candidate.get("team_keys") or [])
    if team_score < 0.82:
        return 0.0

    name_score = score_fuzzy_d1_name_match(row, profile)
    if name_score < 58:
        return 0.0

    total = name_score
    if team_score >= 0.99:
        total += 84.0
    elif team_score >= 0.9:
        total += 72.0
    else:
        total += 60.0

    row_dob = clean_text(row.get("_dob_iso"))
    profile_dob = clean_text(profile.get("born_iso"))
    if row_dob and profile_dob:
        if row_dob != profile_dob:
            return 0.0
        total += 76.0

    height_gap = abs_numeric_gap(row.get("_height_in_value"), profile.get("height_in"))
    if math.isfinite(height_gap):
        if height_gap > 4:
            return 0.0
        if height_gap <= 1:
            total += 18.0
        elif height_gap <= 2:
            total += 10.0
        else:
            total += 4.0

    weight_gap = abs_numeric_gap(row.get("_weight_lb_value"), profile.get("weight_lb"))
    if math.isfinite(weight_gap):
        if weight_gap > 55:
            total -= 16.0
        elif weight_gap <= 12:
            total += 6.0
        elif weight_gap <= 24:
            total += 3.0

    if compare_team_strings(row.get("_team_name"), profile.get("pre_draft_team"), team_alias_map):
        total += 18.0

    return total


def build_d1_link_anchors(d1_groups: list[list[dict[str, object]]]) -> list[dict[str, object]]:
    anchors: list[dict[str, object]] = []
    for group_rows in d1_groups:
        representative = sorted(group_rows, key=identity_row_score, reverse=True)[0]
        years = sorted({canonical_end_year(row.get("season")) for row in group_rows if canonical_end_year(row.get("season"))}, reverse=True)
        canonical_id = clean_text(representative.get("_canonical_player_id")) or build_fallback_canonical_id(representative)
        anchor = {
            "canonical_player_id": canonical_id,
            "realgm_player_id": clean_text(representative.get("_realgm_player_id")),
            "name_key": clean_text(representative.get("_name_key")),
            "loose_name_key": clean_text(representative.get("_loose_name_key")),
            "player_name": clean_text(representative.get("_player_name")),
            "dob": clean_text(representative.get("_dob_iso")),
            "height_in": first_number(representative.get("_height_in_value")),
            "weight_lb": first_number(representative.get("_weight_lb_value")),
            "draft_pick": parse_int_value(representative.get("_draft_pick_value")),
            "min_year": years[-1] if years else 0,
            "max_year": years[0] if years else 0,
        }
        if anchor["name_key"]:
            anchors.append(anchor)
    return anchors


def choose_best_d1_anchor(group_rows: list[dict[str, object]], anchors_by_name: dict[str, dict[str, list[dict[str, object]]]]) -> dict[str, object]:
    profile_scores: dict[str, dict[str, object]] = {}
    for row in sorted(group_rows, key=identity_row_score, reverse=True):
        candidate_pool = []
        for key, bucket in (
            (row.get("_name_key"), anchors_by_name["strict"]),
            (row.get("_loose_name_key"), anchors_by_name["loose"]),
        ):
            if key:
                candidate_pool.extend(bucket.get(key, []))
        seen = set()
        for anchor in candidate_pool:
            anchor_id = clean_text(anchor.get("canonical_player_id"))
            if not anchor_id or anchor_id in seen:
                continue
            seen.add(anchor_id)
            score = score_d1_anchor(row, anchor)
            if score <= 0:
                continue
            entry = profile_scores.setdefault(anchor_id, {"anchor": anchor, "score": 0.0, "best_score": 0.0, "row_hits": set()})
            entry["score"] += score
            entry["best_score"] = max(entry["best_score"], score)
            entry["row_hits"].add(row_identity_key(row))

    if not profile_scores:
        return {"status": "unmatched"}

    ranked = sorted(profile_scores.values(), key=lambda item: (item["score"] + (len(item["row_hits"]) * 10), item["best_score"]), reverse=True)
    best = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    margin = (best["score"] - second["score"]) if second else 999.0
    if best["best_score"] < 82 or margin < 12:
        return {"status": "ambiguous"}
    return {"status": "matched", "anchor": best["anchor"]}


def choose_best_existing_identity_anchor(group_rows: list[dict[str, object]], anchors_by_name: dict[str, dict[str, list[dict[str, object]]]]) -> dict[str, object]:
    profile_scores: dict[str, dict[str, object]] = {}
    for row in sorted(group_rows, key=identity_row_score, reverse=True):
        candidate_pool = []
        for key, bucket in (
            (row.get("_name_key"), anchors_by_name["strict"]),
            (row.get("_loose_name_key"), anchors_by_name["loose"]),
        ):
            if key:
                candidate_pool.extend(bucket.get(key, []))
        seen = set()
        for anchor in candidate_pool:
            anchor_id = clean_text(anchor.get("canonical_player_id"))
            if not anchor_id or anchor_id in seen or not clean_text(anchor.get("realgm_player_id")):
                continue
            seen.add(anchor_id)
            score = score_d1_anchor(row, anchor)
            if score <= 0:
                continue
            entry = profile_scores.setdefault(anchor_id, {"anchor": anchor, "score": 0.0, "best_score": 0.0, "row_hits": set()})
            entry["score"] += score
            entry["best_score"] = max(entry["best_score"], score)
            entry["row_hits"].add(row_identity_key(row))

    if not profile_scores:
        return {"status": "unmatched"}

    ranked = sorted(profile_scores.values(), key=lambda item: (item["score"] + (len(item["row_hits"]) * 10), item["best_score"]), reverse=True)
    best = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    margin = (best["score"] - second["score"]) if second else 999.0
    if best["best_score"] < 104 or margin < 18:
        return {"status": "ambiguous"}
    return {"status": "matched", "anchor": best["anchor"]}


def score_d1_anchor(row: dict[str, object], anchor: dict[str, object]) -> float:
    if row.get("_name_key") == anchor.get("name_key"):
        total = 72.0
    elif row.get("_loose_name_key") and row.get("_loose_name_key") == anchor.get("loose_name_key"):
        total = 54.0
    else:
        return 0.0

    row_dob = clean_text(row.get("_dob_iso"))
    anchor_dob = clean_text(anchor.get("dob"))
    if row_dob and anchor_dob:
        if row_dob != anchor_dob:
            return 0.0
        total += 80.0

    height_gap = abs_numeric_gap(row.get("_height_in_value"), anchor.get("height_in"))
    if math.isfinite(height_gap):
        if height_gap > 4:
            return 0.0
        if height_gap <= 1:
            total += 22.0
        elif height_gap <= 2:
            total += 12.0
        else:
            total += 5.0

    row_year = canonical_end_year(row.get("season"))
    anchor_min_year = parse_int_value(anchor.get("min_year"))
    anchor_max_year = parse_int_value(anchor.get("max_year"))
    if row_year and anchor_min_year and anchor_max_year:
        if row_year > (anchor_max_year + 2):
            return 0.0
        distance = min(abs(row_year - anchor_min_year), abs(row_year - anchor_max_year))
        if distance <= 1:
            total += 18.0
        elif distance <= 3:
            total += 12.0
        elif distance <= 5:
            total += 6.0
        elif distance > 8:
            return 0.0

    if clean_text(anchor.get("realgm_player_id")):
        total += 6.0
    return total


def assign_identity_anchor_to_group(group_rows: list[dict[str, object]], anchor: dict[str, object], source: str) -> None:
    canonical_id = clean_text(anchor.get("canonical_player_id"))
    realgm_player_id = clean_text(anchor.get("realgm_player_id"))
    for row in group_rows:
        row["_canonical_player_id"] = canonical_id
        row["_realgm_player_id"] = realgm_player_id
        row["_match_source"] = source


def assign_d1_anchor_to_group(group_rows: list[dict[str, object]], anchor: dict[str, object]) -> None:
    assign_identity_anchor_to_group(group_rows, anchor, "d1_link")


def reconcile_d1_linked_groups(site_data: dict[str, dict[str, object]]) -> dict[str, int]:
    fallback_updates: dict[str, tuple[str, str]] = {}
    for group_rows in group_rows_by_identity(site_data["d1"]["rows"]):
        representative = sorted(group_rows, key=identity_row_score, reverse=True)[0]
        fallback_id = build_fallback_canonical_id(representative)
        canonical_id = clean_text(representative.get("_canonical_player_id"))
        if not fallback_id or not canonical_id or canonical_id == fallback_id:
            continue
        fallback_updates[fallback_id] = (
            canonical_id,
            clean_text(representative.get("_realgm_player_id")),
        )

    updated_rows = 0
    updated_groups = 0
    for dataset_id in ("d2", "naia", "juco", "fiba"):
        for group_rows in group_rows_by_identity(site_data[dataset_id]["rows"]):
            if clean_text(group_rows[0].get("_match_source")) != "d1_link":
                continue
            current_id = clean_text(group_rows[0].get("_canonical_player_id"))
            next_ids = fallback_updates.get(current_id)
            if not next_ids:
                continue
            updated_groups += 1
            canonical_id, realgm_player_id = next_ids
            for row in group_rows:
                row["_canonical_player_id"] = canonical_id
                row["_realgm_player_id"] = realgm_player_id
                row["_match_source"] = "d1_link_reconciled"
                updated_rows += 1

    return {"anchors": len(fallback_updates), "groups": updated_groups, "rows": updated_rows}


def choose_best_d1_profile(
    group_rows: list[dict[str, object]],
    player_name_index: dict[str, dict[str, list[dict[str, object]]]],
    team_alias_map: dict[str, dict[str, object]],
) -> dict[str, object]:
    profile_scores: dict[str, dict[str, object]] = {}
    for row in sorted(group_rows, key=identity_row_score, reverse=True):
        candidate_pool = []
        for key in {row.get("_name_key"), row.get("_loose_name_key")}:
            if key:
                candidate_pool.extend(player_name_index["strict"].get(key, []))
                candidate_pool.extend(player_name_index["loose"].get(key, []))
        seen = set()
        for profile in candidate_pool:
            profile_id = clean_text(profile.get("realgm_player_id"))
            if not profile_id or profile_id in seen:
                continue
            seen.add(profile_id)
            score = score_d1_profile(row, profile, team_alias_map)
            if score <= 0:
                continue
            entry = profile_scores.setdefault(profile_id, {
                "profile": profile,
                "score": 0.0,
                "best_score": 0.0,
                "row_hits": set(),
            })
            entry["score"] += score
            entry["best_score"] = max(entry["best_score"], score)
            entry["row_hits"].add(row_identity_key(row))

    if not profile_scores:
        return {"status": "unmatched"}

    ranked = sorted(
        profile_scores.values(),
        key=lambda item: (item["score"] + (len(item["row_hits"]) * 16), item["best_score"]),
        reverse=True,
    )
    best = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    margin = (best["score"] - second["score"]) if second else 999.0
    if best["best_score"] < 118 or margin < 16:
        return {"status": "ambiguous"}
    return {"status": "matched", "profile": best["profile"], "source": "realgm_d1_bridge"}


def score_d1_profile(row: dict[str, object], profile: dict[str, object], team_alias_map: dict[str, dict[str, object]]) -> float:
    if row.get("_name_key") == profile.get("name_key"):
        total = 72.0
    elif row.get("_loose_name_key") and row.get("_loose_name_key") == profile.get("loose_name_key"):
        total = 54.0
    else:
        return 0.0

    row_dob = clean_text(row.get("_dob_iso"))
    profile_dob = clean_text(profile.get("born_iso"))
    if row_dob and profile_dob:
        if row_dob != profile_dob:
            return 0.0
        total += 92.0
    elif row_dob:
        total += 6.0

    height_gap = abs_numeric_gap(row.get("_height_in_value"), profile.get("height_in"))
    if math.isfinite(height_gap):
        if height_gap > 4:
            return 0.0
        if height_gap <= 1:
            total += 22.0
        elif height_gap <= 2:
            total += 12.0
        else:
            total += 5.0

    weight_gap = abs_numeric_gap(row.get("_weight_lb_value"), profile.get("weight_lb"))
    if math.isfinite(weight_gap):
        if weight_gap > 50:
            total -= 12.0
        elif weight_gap <= 12:
            total += 6.0
        elif weight_gap <= 24:
            total += 3.0

    row_year = canonical_end_year(row.get("season"))
    row_team_keys = build_row_team_keys("d1", row, team_alias_map)

    college_team_score = best_profile_team_match_score(profile.get("college_seasons") or [], row_year, row_team_keys)
    if college_team_score >= 0.99:
        total += 88.0
    elif college_team_score >= 0.82:
        total += 74.0
    elif college_team_score >= 0.66:
        total += 56.0
    elif college_team_score >= 0.5:
        total += 30.0

    if compare_team_strings(row.get("_team_name"), profile.get("pre_draft_team"), team_alias_map):
        total += 26.0

    profile_years = collect_profile_years(profile)
    if row_year and profile_years:
        min_year = min(profile_years)
        max_year = max(profile_years)
        if row_year > (max_year + 2):
            return 0.0
        if row_year < (min_year - 10):
            return 0.0
        distance = min(abs(row_year - min_year), abs(row_year - max_year))
        if min_year <= row_year <= max_year:
            total += 16.0
        elif distance <= 2:
            total += 10.0
        elif distance <= 5:
            total += 5.0

    if clean_text(profile.get("realgm_player_id")):
        total += 8.0
    if clean_text(profile.get("summary_url")):
        total += 2.0
    return total


def best_profile_team_match_score(profile_seasons: list[dict[str, object]], target_year: int, row_team_keys: list[str]) -> float:
    if not target_year or not row_team_keys or not profile_seasons:
        return 0.0
    best_score = 0.0
    for season_entry in profile_seasons:
        if canonical_end_year(season_entry.get("season")) != target_year:
            continue
        season_team = clean_text(season_entry.get("school") or season_entry.get("team"))
        season_team_keys = build_school_keys(season_team) or [normalize_key(season_team)]
        best_score = max(best_score, score_team_key_sets(row_team_keys, season_team_keys))
    return best_score


def collect_profile_years(profile: dict[str, object]) -> list[int]:
    years = set()
    for season_entries in (
        profile.get("college_seasons") or [],
        profile.get("intl_seasons") or [],
        profile.get("gleague_seasons") or [],
        profile.get("nba_seasons") or [],
    ):
        for season_entry in season_entries:
            season_year = canonical_end_year(season_entry.get("season"))
            if season_year:
                years.add(season_year)
    return sorted(years)


def group_rows_by_identity(rows: list[dict[str, object]]) -> list[list[dict[str, object]]]:
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        grouped[row["_identity_group_key"]].append(row)
    return list(grouped.values())


def assign_profile_to_group(group_rows: list[dict[str, object]], profile: dict[str, object], source: str) -> None:
    canonical_id = profile["canonical_player_id"]
    realgm_player_id = profile["realgm_player_id"]
    for row in group_rows:
        row["_canonical_player_id"] = canonical_id
        row["_realgm_player_id"] = realgm_player_id
        row["_match_source"] = source


def load_and_match_grassroots_rows(
    player_name_index: dict[str, dict[str, list[dict[str, object]]]],
) -> tuple[list[dict[str, object]], dict[str, int]]:
    rows = [annotate_grassroots_identity_row(row) for row in load_grassroots_rows_from_chunks()]
    matched = 0
    ambiguous = 0
    unmatched = 0

    grouped_rows: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        grouped_rows[get_grassroots_identity_group_key(row)].append(row)

    for group in grouped_rows.values():
        representative = max(group, key=grassroots_identity_row_score)
        result = choose_best_grassroots_profile(representative, player_name_index)
        if result["status"] == "matched":
            matched += len(group)
        elif result["status"] == "ambiguous":
            ambiguous += len(group)
        else:
            unmatched += len(group)

        for row in group:
            if result["status"] == "matched":
                profile = result["profile"]
                row["_canonical_player_id"] = profile["canonical_player_id"]
                row["_realgm_player_id"] = profile["realgm_player_id"]
                row["_match_source"] = result["source"]
            else:
                row["_canonical_player_id"] = build_grassroots_fallback_canonical_id(row)
                row["_match_source"] = "grassroots_fallback"
            row["canonical_player_id"] = clean_text(row.get("_canonical_player_id"))
            row["realgm_player_id"] = clean_text(row.get("_realgm_player_id"))
            row["profile_match_source"] = clean_text(row.get("_match_source"))

    return rows, {
        "rows": len(rows),
        "groups": len(grouped_rows),
        "matched": matched,
        "ambiguous": ambiguous,
        "unmatched": unmatched,
    }


def annotate_grassroots_identity_row(row: dict[str, object]) -> dict[str, object]:
    out = dict(row)
    player_name = clean_display_name(out.get("player_name") or out.get("player"))
    team_name = clean_text(out.get("team_name") or out.get("team_full"))
    season = canonical_season_label(out.get("season"))
    class_year = canonical_end_year(out.get("class_year"))
    state = normalize_state_abbreviation(out.get("state"))
    team_state = normalize_state_abbreviation(out.get("team_state")) or state
    out["player_name"] = player_name
    out["player"] = player_name
    out["team_name"] = team_name
    out["team_full"] = clean_text(out.get("team_full")) or team_name
    out["season"] = season
    out["class_year"] = class_year or clean_text(out.get("class_year"))
    out["state"] = state
    out["team_state"] = team_state
    out["_dataset_id"] = "grassroots"
    out["_player_name"] = player_name
    out["_team_name"] = team_name
    out["_team_display"] = clean_text(out.get("team_full")) or team_name
    out["_season_start"] = canonical_end_year(season)
    out["_name_key"] = normalize_name_key(player_name)
    out["_loose_name_key"] = normalize_loose_name_key(player_name)
    out["_team_keys"] = [normalize_key(team_name)] if team_name else []
    out["_source_player_id"] = clean_text(out.get("career_player_key"))
    out["_dob_iso"] = ""
    out["_height_in_value"] = first_number(out.get("height_in"), parse_height_to_inches(out.get("height")))
    out["_weight_lb_value"] = first_number(out.get("weight_lb"), out.get("weight"))
    out["_draft_pick_value"] = None
    out["_rookie_year_value"] = None
    out["_canonical_player_id"] = ""
    out["_realgm_player_id"] = ""
    out["_identity_group_key"] = get_grassroots_identity_group_key(out)
    return out


def get_grassroots_identity_group_key(row: dict[str, object]) -> str:
    name_key = normalize_name_key(row.get("_player_name") or row.get("player_name"))
    class_year = canonical_end_year(row.get("class_year"))
    if name_key and class_year:
        return f"grgrp|{name_key.replace(' ', '_')}|{class_year}"
    return clean_text(row.get("career_player_key")) or build_grassroots_fallback_canonical_id(row)


def grassroots_identity_row_score(row: dict[str, object]) -> float:
    score = 0.0
    if normalize_state_abbreviation(row.get("state") or row.get("team_state")):
        score += 8.0
    if first_number(row.get("_height_in_value")) is not None:
        score += 8.0
    if clean_text(row.get("team_name")):
        score += 4.0
    if clean_text(row.get("player_name")):
        score += 2.0
    return score


def choose_best_grassroots_profile(
    row: dict[str, object],
    player_name_index: dict[str, dict[str, list[dict[str, object]]]],
) -> dict[str, object]:
    candidates: list[dict[str, object]] = []
    seen: set[str] = set()
    for key, bucket in (
        (row.get("_name_key"), player_name_index["strict"]),
        (row.get("_loose_name_key"), player_name_index["loose"]),
    ):
        if not key:
            continue
        for profile in bucket.get(key, []):
            profile_id = clean_text(profile.get("realgm_player_id"))
            if not profile_id or profile_id in seen:
                continue
            seen.add(profile_id)
            candidates.append(profile)

    if not candidates:
        return {"status": "unmatched"}

    ranked = []
    for profile in candidates:
        score = score_grassroots_profile(row, profile)
        if score > 0:
            ranked.append({"profile": profile, "score": score})
    if not ranked:
        return {"status": "unmatched"}

    ranked.sort(key=lambda item: item["score"], reverse=True)
    best = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    margin = best["score"] - second["score"] if second else 999.0
    if best["score"] < 82 or margin < 8:
        return {"status": "ambiguous"}
    return {"status": "matched", "profile": best["profile"], "source": "realgm_grassroots"}


def score_grassroots_profile(row: dict[str, object], profile: dict[str, object]) -> float:
    if row.get("_name_key") == profile.get("name_key"):
        total = 68.0
    elif row.get("_loose_name_key") and row.get("_loose_name_key") == profile.get("loose_name_key"):
        total = 48.0
    else:
        return 0.0

    expected_college_year = expected_college_end_year_from_class_year(row.get("class_year"))
    earliest_college_year = get_profile_earliest_college_year(profile)
    if expected_college_year and earliest_college_year:
        gap = abs(expected_college_year - earliest_college_year)
        if gap == 0:
            total += 24.0
        elif gap == 1:
            total += 14.0
        elif gap == 2:
            total += 6.0
        else:
            return 0.0
    elif expected_college_year:
        earliest_professional_year = get_profile_earliest_professional_year(profile)
        if earliest_professional_year:
            gap = abs(expected_college_year - earliest_professional_year)
            if gap == 0:
                total += 20.0
            elif gap == 1:
                total += 12.0
            elif gap == 2:
                total += 4.0
            else:
                return 0.0

    row_height = positive_number(row.get("_height_in_value"))
    profile_height = positive_number(profile.get("height_in"))
    if row_height is not None and profile_height is not None:
        height_gap = abs(row_height - profile_height)
        if height_gap > 4:
            return 0.0
        if height_gap <= 1:
            total += 16.0
        elif height_gap <= 2:
            total += 10.0
        else:
            total += 4.0

    row_state = normalize_state_abbreviation(row.get("state") or row.get("team_state"))
    hometown_state = profile_state_abbreviation(profile)
    if row_state and hometown_state:
        if row_state == hometown_state:
            total += 10.0
        else:
            total -= 4.0

    high_school_score = score_team_key_sets(build_school_keys(row.get("team_name")), build_school_keys(profile.get("high_school")))
    if high_school_score >= 0.99:
        total += 20.0
    elif high_school_score >= 0.82:
        total += 14.0
    elif high_school_score >= 0.66:
        total += 8.0

    if clean_text(profile.get("high_school")):
        total += 2.0
    if profile.get("college_seasons"):
        total += 3.0
    elif get_profile_earliest_professional_year(profile):
        total += 4.0

    return total


def expected_college_end_year_from_class_year(value: object) -> int:
    class_year = canonical_end_year(value)
    return class_year + 1 if class_year else 0


def get_profile_earliest_college_year(profile: dict[str, object]) -> int:
    years = [
        canonical_end_year(entry.get("season"))
        for entry in (profile.get("college_seasons") or [])
        if canonical_end_year(entry.get("season"))
    ]
    return min(years) if years else 0


def get_profile_earliest_professional_year(profile: dict[str, object]) -> int:
    seasons = (
        (profile.get("professional_seasons") or [])
        or (profile.get("nba_seasons") or [])
        or (profile.get("gleague_seasons") or [])
        or (profile.get("intl_seasons") or [])
    )
    years = [
        canonical_end_year(entry.get("season"))
        for entry in seasons
        if canonical_end_year(entry.get("season"))
    ]
    return min(years) if years else 0


def normalize_state_abbreviation(value: object) -> str:
    text = clean_text(value)
    if not text:
        return ""
    upper = text.upper()
    if upper in US_STATE_CODES:
        return upper
    key = normalize_key(text)
    return US_STATE_ABBREVIATIONS.get(key, upper if upper in US_STATE_CODES else "")


def extract_state_abbreviation_from_location(value: object) -> str:
    text = clean_text(value)
    if not text:
        return ""
    parts = [part.strip() for part in text.split(",") if part.strip()]
    if parts:
        candidate = normalize_state_abbreviation(parts[-1])
        if candidate:
            return candidate
    return normalize_state_abbreviation(text)


def profile_state_abbreviation(profile: dict[str, object]) -> str:
    return extract_state_abbreviation_from_location(profile.get("hometown")) or extract_state_abbreviation_from_location(profile.get("high_school"))


def build_grassroots_fallback_canonical_id(row: dict[str, object]) -> str:
    name_key = normalize_name_key(row.get("_player_name"))
    class_year = canonical_end_year(row.get("class_year"))
    height = round_int(row.get("_height_in_value"))
    state = normalize_state_abbreviation(row.get("state") or row.get("team_state")) or "XX"
    return f"gr_{name_key.replace(' ', '_')}_{class_year or 'na'}_{height or 'na'}_{state.lower()}"


def apply_fallback_identity(site_data: dict[str, dict[str, object]]) -> None:
    for bundle in site_data.values():
        for row in bundle["rows"]:
            if row.get("_canonical_player_id"):
                continue
            fallback_key = build_fallback_canonical_id(row)
            row["_canonical_player_id"] = fallback_key
            row["_match_source"] = "fallback"


def finalize_row_identity_fields(site_data: dict[str, dict[str, object]], profiles: dict[str, dict[str, object]]) -> None:
    profile_map = {profile["canonical_player_id"]: profile for profile in profiles.values()}
    for bundle in site_data.values():
        for row in bundle["rows"]:
            canonical_id = clean_text(row.get("_canonical_player_id"))
            if not canonical_id:
                continue
            profile = profile_map.get(canonical_id)
            row["canonical_player_id"] = canonical_id
            row["player_profile_key"] = canonical_id
            row["source_player_id"] = clean_text(row.get("_source_player_id") or row.get("player_id") or row.get("pid") or row.get("id"))
            row["realgm_player_id"] = clean_text(row.get("_realgm_player_id"))
            row["realgm_summary_url"] = clean_text(profile.get("summary_url")) if profile else ""
            row["profile_levels"] = clean_text(row.get("profile_levels")) or ""
            row["profile_career_path"] = clean_text(row.get("profile_career_path")) or ""
            row["profile_match_source"] = clean_text(row.get("_match_source"))


def add_realgm_team_aliases_from_matches(site_data: dict[str, dict[str, object]], team_alias_map: dict[str, dict[str, object]], team_alias_details: dict[str, dict[str, object]]) -> None:
    for dataset_id, bundle in site_data.items():
        config = bundle["config"]
        profile_level = config["profile_level"]
        for row in bundle["rows"]:
            if row.get("_match_source") == "fallback":
                continue
            canonical_team = clean_text(row.get(config["team_column"]))
            if not canonical_team:
                continue
            register_team_alias(team_alias_map, team_alias_details, row.get(config["team_display_column"]) or canonical_team, canonical_team, "site_match", profile_level, 1.0)
            profile_realgm_team = clean_text(row.get("profile_realgm_team"))
            if profile_realgm_team:
                register_team_alias(team_alias_map, team_alias_details, profile_realgm_team, canonical_team, "realgm", profile_level, 0.95)


def apply_rim_data(site_data: dict[str, dict[str, object]], team_alias_map: dict[str, dict[str, object]], team_alias_details: dict[str, dict[str, object]]) -> dict[str, dict[str, int]]:
    summary: dict[str, dict[str, int]] = {}
    for dataset_id in ("d2", "naia", "juco"):
        bundle = site_data[dataset_id]
        config = RIM_DATASETS[dataset_id]
        summary[dataset_id] = apply_college_rim_dataset(dataset_id, bundle["rows"], config, team_alias_map, team_alias_details)
    summary["fiba"] = apply_fiba_rim_dataset(site_data["fiba"]["rows"], RIM_DATASETS["fiba"], team_alias_map, team_alias_details)
    return summary


def apply_college_rim_dataset(dataset_id: str, rows: list[dict[str, object]], config: dict[str, object], team_alias_map: dict[str, dict[str, object]], team_alias_details: dict[str, dict[str, object]]) -> dict[str, int]:
    total = 0
    matched = 0
    ambiguous = 0
    missing = 0
    index = build_rim_row_index(rows, dataset_id, config["player_column"], config["team_column"], team_alias_map)
    for file_path in sorted(config["rim_dir"].glob("*.csv")):
        season = config["season_parser"](file_path.name)
        if not season:
            continue
        for rim_row in load_plain_csv_rows(file_path):
            total += 1
            match = resolve_rim_match(index, dataset_id, season, rim_row.get("Player"), rim_row.get("Team"), team_alias_map)
            if not match:
                missing += 1
                continue
            if match["ambiguous"]:
                ambiguous += 1
                continue
            supplement = build_rim_supplement(match["row"], rim_row, config["two_att"], config["two_made"])
            if not supplement:
                missing += 1
                continue
            matched += 1
            match["row"].update(supplement)
            register_team_alias(team_alias_map, team_alias_details, rim_row.get("Team"), clean_text(match["row"].get(config["team_column"])), "rim", SITE_DATASETS[dataset_id]["profile_level"], 0.9)
    return {"total": total, "matched": matched, "ambiguous": ambiguous, "missing": missing}


def apply_fiba_rim_dataset(rows: list[dict[str, object]], config: dict[str, object], team_alias_map: dict[str, dict[str, object]], team_alias_details: dict[str, dict[str, object]]) -> dict[str, int]:
    total = 0
    matched = 0
    ambiguous = 0
    missing = 0
    index = build_rim_row_index(rows, "fiba", config["player_column"], config["team_column"], team_alias_map)
    for rim_dir, competition_key in config["rim_dirs"]:
        for file_path in sorted(rim_dir.glob("*.csv")):
            season = config["season_parser"](file_path.name)
            if not season:
                continue
            for rim_row in load_plain_csv_rows(file_path):
                total += 1
                match = resolve_rim_match(index, "fiba", season, rim_row.get("Player"), rim_row.get("Team"), team_alias_map, competition_key)
                if not match:
                    missing += 1
                    continue
                if match["ambiguous"]:
                    ambiguous += 1
                    continue
                supplement = build_rim_supplement(match["row"], rim_row, config["two_att"], config["two_made"])
                if not supplement:
                    missing += 1
                    continue
                matched += 1
                match["row"].update(supplement)
                register_team_alias(team_alias_map, team_alias_details, rim_row.get("Team"), clean_text(match["row"].get("team_name")), "rim", "FIBA", 0.9)
    return {"total": total, "matched": matched, "ambiguous": ambiguous, "missing": missing}


def build_rim_row_index(rows: list[dict[str, object]], dataset_id: str, player_column: str, team_column: str, team_alias_map: dict[str, dict[str, object]]) -> dict[str, list[dict[str, object]]]:
    index: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        season = clean_text(row.get("season"))
        if not season:
            continue
        name_keys = {normalize_name_key(row.get(player_column)), normalize_loose_name_key(row.get(player_column))}
        team_keys = build_row_team_keys(dataset_id, row, team_alias_map)
        prefix = f"{season}|{clean_text(row.get('competition_key'))}|" if dataset_id == "fiba" else f"{season}|"
        for name_key in name_keys:
            if not name_key:
                continue
            index[prefix + name_key].append({"row": row, "team_keys": team_keys})
    return index


def resolve_rim_match(index: dict[str, list[dict[str, object]]], dataset_id: str, season: str, player_name: object, team_name: object, team_alias_map: dict[str, dict[str, object]], competition_key: str = "") -> dict[str, object] | None:
    prefix = f"{season}|{competition_key}|" if dataset_id == "fiba" else f"{season}|"
    candidate_rows: dict[int, dict[str, object]] = {}
    for name_key in {normalize_name_key(player_name), normalize_loose_name_key(player_name)}:
        if not name_key:
            continue
        for candidate in index.get(prefix + name_key, []):
            candidate_rows[id(candidate["row"])] = candidate
    if not candidate_rows:
        return None

    rim_team_keys = build_team_keys_with_alias(team_name, dataset_id, team_alias_map)
    scored = []
    for candidate in candidate_rows.values():
        score = score_team_key_sets(candidate["team_keys"], rim_team_keys)
        scored.append({"row": candidate["row"], "score": score})
    scored.sort(key=lambda item: item["score"], reverse=True)
    best = scored[0]
    second = scored[1] if len(scored) > 1 else None
    if best["score"] <= 0:
        return None
    if not second:
        return {"row": best["row"], "ambiguous": False}
    if best["score"] >= 0.82 and (best["score"] - second["score"]) >= 0.12:
        return {"row": best["row"], "ambiguous": False}
    if best["score"] > second["score"] and second["score"] == 0:
        return {"row": best["row"], "ambiguous": False}
    return {"row": None, "ambiguous": True}


def build_rim_supplement(row: dict[str, object], rim_row: dict[str, object], two_att_fn, two_made_fn) -> dict[str, object] | None:
    rim_gp = to_float(rim_row.get("GP"))
    target_gp = first_number(row.get("gp"), row.get("g"), rim_gp)
    rim_att_pg = first_number(rim_row.get("2 FG Att"), rim_row.get("FG Att"))
    rim_made_pg = first_number(rim_row.get("2 FG Made"), rim_row.get("FG Made"))
    two_att = two_att_fn(row)
    two_made = two_made_fn(row)

    if target_gp is None or target_gp <= 0 or rim_att_pg is None or rim_made_pg is None:
        return None

    rim_att = rim_att_pg * target_gp
    rim_made = rim_made_pg * target_gp
    if two_att is not None and rim_att > two_att:
        factor = (two_att / rim_att) if rim_att else 0
        rim_att *= factor
        rim_made *= factor
    if rim_made > rim_att:
        rim_made = rim_att
    if two_made is not None and rim_made > two_made:
        rim_made = two_made

    mid_att = (two_att - rim_att) if two_att is not None else None
    mid_made = (two_made - rim_made) if two_made is not None else None
    if mid_att is not None:
        mid_att = max(0.0, mid_att)
    if mid_made is not None:
        mid_made = max(0.0, min(mid_made, mid_att if mid_att is not None else mid_made))

    return {
        "rim_made": round_number(rim_made, 3),
        "rim_att": round_number(rim_att, 3),
        "rim_pct": round_number(zero_safe_percent(rim_made, rim_att), 1),
        "mid_made": round_number(mid_made, 3) if mid_made is not None else "",
        "mid_att": round_number(mid_att, 3) if mid_att is not None else "",
        "mid_pct": round_number(zero_safe_percent(mid_made, mid_att), 1) if mid_made is not None and mid_att is not None else "",
        "rim_source_gp": round_number(rim_gp, 3) if rim_gp is not None else "",
    }


def profile_level_for_dataset(dataset_id: str) -> str:
    if dataset_id == "grassroots":
        return "Grassroots"
    if dataset_id in SITE_DATASETS:
        return clean_text(SITE_DATASETS[dataset_id]["profile_level"])
    if dataset_id in {"realgm_international", "realgm_gleague", "realgm_nba"}:
        return "Professional"
    if dataset_id == "realgm_college":
        return "College"
    return clean_text(dataset_id).upper()


def display_source_dataset(source_name: str) -> str:
    return {
        "d1": "D1",
        "d2": "D2",
        "naia": "NAIA",
        "juco": "JUCO",
        "grassroots": "Grassroots",
        "fiba": "FIBA",
        "nba": "NBA",
        "realgm_college": "RealGM College",
        "realgm_international": "RealGM International",
        "realgm_gleague": "RealGM G League",
        "realgm_nba": "RealGM NBA",
    }.get(clean_text(source_name), clean_text(source_name))


def build_realgm_overlay_for_site_row(dataset_id: str, row: dict[str, object], profile: dict[str, object]) -> dict[str, object]:
    match = find_matching_realgm_season_entry(dataset_id, row, profile)
    if not match:
        return {}
    stats = match.get("stats") if isinstance(match, dict) else {}
    if not isinstance(stats, dict):
        return {}

    gp = to_float(stats.get("gp"))
    mpg = to_float(stats.get("min"))
    pts_pg = to_float(stats.get("pts"))
    trb_pg = first_number(stats.get("trb"), stats.get("reb"))
    ast_pg = to_float(stats.get("ast"))
    stl_pg = to_float(stats.get("stl"))
    blk_pg = to_float(stats.get("blk"))
    tov_pg = to_float(stats.get("tov"))

    return {
        "dob": clean_text(profile.get("born_iso")),
        "age": to_float(stats.get("age")),
        "class_year": clean_text(stats.get("class")),
        "gp": gp,
        "mpg": mpg,
        "min": round_number(gp * mpg, 3) if gp is not None and mpg is not None else "",
        "pts_pg": pts_pg,
        "trb_pg": trb_pg,
        "ast_pg": ast_pg,
        "stl_pg": stl_pg,
        "blk_pg": blk_pg,
        "tov_pg": tov_pg,
        "pts": round_number(gp * pts_pg, 3) if gp is not None and pts_pg is not None else "",
        "trb": round_number(gp * trb_pg, 3) if gp is not None and trb_pg is not None else "",
        "ast": round_number(gp * ast_pg, 3) if gp is not None and ast_pg is not None else "",
        "stl": round_number(gp * stl_pg, 3) if gp is not None and stl_pg is not None else "",
        "blk": round_number(gp * blk_pg, 3) if gp is not None and blk_pg is not None else "",
        "tov": round_number(gp * tov_pg, 3) if gp is not None and tov_pg is not None else "",
        "fg_pct": normalize_site_percent_value("realgm", "fg_pct", first_non_blank(stats.get("fg"), stats.get("fg_pct"))),
        "three_p_pct": normalize_site_percent_value("realgm", "three_p_pct", first_non_blank(stats.get("3p"), stats.get("3p_pct"))),
        "ft_pct": normalize_site_percent_value("realgm", "ft_pct", first_non_blank(stats.get("ft"), stats.get("ft_pct"))),
    }


def find_matching_realgm_season_entry(dataset_id: str, row: dict[str, object], profile: dict[str, object]) -> dict[str, object] | None:
    if not profile:
        return None
    if dataset_id in {"d1", "d2", "naia", "juco"}:
        season_entries = profile.get("college_seasons") or []
    elif dataset_id == "fiba":
        season_entries = profile.get("intl_seasons") or []
    elif dataset_id == "nba":
        season_entries = profile.get("nba_seasons") or []
    else:
        return None

    target_year = canonical_end_year(row.get("season"))
    target_team = clean_text(row.get("_team_name") or row.get("team_name"))
    target_team_keys = build_school_keys(target_team) or [normalize_key(target_team)]
    year_matches = []
    for entry in season_entries:
        if canonical_end_year(entry.get("season")) != target_year:
            continue
        season_team = clean_text(entry.get("school") or entry.get("team"))
        season_team_keys = build_school_keys(season_team) or [normalize_key(season_team)]
        score = score_team_key_sets(target_team_keys, season_team_keys)
        year_matches.append((score, entry))

    if not year_matches:
        return None
    year_matches.sort(key=lambda item: item[0], reverse=True)
    if year_matches[0][0] >= 0.82:
        return year_matches[0][1]
    if len(year_matches) == 1:
        return year_matches[0][1]
    return None


def build_player_profiles(
    site_data: dict[str, dict[str, object]],
    profiles: dict[str, dict[str, object]],
    grassroots_rows: list[dict[str, object]] | None = None,
) -> dict[str, dict[str, object]]:
    profile_map: dict[str, dict[str, object]] = {}
    profile_lookup = {profile["canonical_player_id"]: profile for profile in profiles.values()}

    row_groups = [bundle["rows"] for bundle in site_data.values()]
    if grassroots_rows:
        row_groups.append(grassroots_rows)

    for rows in row_groups:
        for row in rows:
            canonical_id = clean_text(row.get("_canonical_player_id"))
            if not canonical_id:
                continue
            base_profile = profile_lookup.get(canonical_id)
            entry = profile_map.setdefault(canonical_id, {
                "canonical_player_id": canonical_id,
                "realgm_player_id": clean_text(row.get("_realgm_player_id")),
                "player_name": clean_text(row.get("_player_name")),
                "born_iso": clean_text(row.get("_dob_iso")),
                "height_in": row.get("_height_in_value") or "",
                "weight_lb": row.get("_weight_lb_value") or "",
                "nationality": "",
                "high_school": "",
                "hometown": "",
                "pre_draft_team": "",
                "current_team": "",
                "current_nba_status": "",
            "summary_url": "",
            "college_seasons": [],
                "intl_seasons": [],
                "gleague_seasons": [],
                "nba_seasons": [],
                "professional_seasons": [],
                "levels": set(),
                "seasons": [],
            })
            if base_profile:
                entry["realgm_player_id"] = base_profile["realgm_player_id"]
                entry["player_name"] = base_profile["player_name"] or entry["player_name"]
                entry["born_iso"] = base_profile["born_iso"] or entry["born_iso"]
                entry["height_in"] = base_profile["height_in"] or entry["height_in"]
                entry["weight_lb"] = base_profile["weight_lb"] or entry["weight_lb"]
                entry["nationality"] = base_profile["nationality"]
                entry["high_school"] = base_profile["high_school"]
                entry["hometown"] = base_profile["hometown"]
                entry["pre_draft_team"] = base_profile["pre_draft_team"]
                entry["current_team"] = base_profile["current_team"]
                entry["current_nba_status"] = base_profile["current_nba_status"]
                entry["summary_url"] = base_profile["summary_url"]
                entry["college_seasons"] = base_profile.get("college_seasons") or entry["college_seasons"]
                entry["intl_seasons"] = base_profile.get("intl_seasons") or entry["intl_seasons"]
                entry["gleague_seasons"] = base_profile.get("gleague_seasons") or entry["gleague_seasons"]
                entry["nba_seasons"] = base_profile.get("nba_seasons") or entry["nba_seasons"]
                entry["professional_seasons"] = base_profile.get("professional_seasons") or entry["professional_seasons"]
            entry["player_name"] = pick_preferred_name(entry["player_name"], row.get("_player_name"))
            dataset_id = clean_text(row.get("_dataset_id"))
            entry["levels"].add(profile_level_for_dataset(dataset_id))
            entry["seasons"].append({
                "source": dataset_id,
                "season": canonical_season_label(row.get("season")),
                "team": clean_text(row.get("_team_name")),
            })

    for profile in profiles.values():
        canonical_id = profile["canonical_player_id"]
        entry = profile_map.setdefault(canonical_id, {
            "canonical_player_id": canonical_id,
            "realgm_player_id": profile["realgm_player_id"],
            "player_name": profile["player_name"],
            "born_iso": profile["born_iso"],
            "height_in": profile["height_in"] or "",
            "weight_lb": profile["weight_lb"] or "",
            "nationality": profile["nationality"],
            "high_school": profile["high_school"],
            "hometown": profile["hometown"],
            "pre_draft_team": profile["pre_draft_team"],
            "current_team": profile["current_team"],
            "current_nba_status": profile["current_nba_status"],
            "summary_url": profile["summary_url"],
            "college_seasons": profile.get("college_seasons") or [],
            "intl_seasons": profile.get("intl_seasons") or [],
            "gleague_seasons": profile.get("gleague_seasons") or [],
            "nba_seasons": profile.get("nba_seasons") or [],
            "professional_seasons": profile.get("professional_seasons") or [],
            "levels": set(),
            "seasons": [],
        })
        for season in profile["college_seasons"]:
            entry["levels"].add(derive_realgm_competition_level("realgm_college", clean_text(season.get("school"))))
            entry["seasons"].append({"source": "realgm_college", "season": canonical_season_label(season["season"]), "team": season["school"]})
        for season in profile["intl_seasons"]:
            entry["levels"].add("International")
            entry["levels"].add("Professional")
            entry["seasons"].append({"source": "realgm_international", "season": canonical_season_label(season["season"]), "team": season["team"]})
        for season in profile.get("gleague_seasons") or []:
            entry["levels"].add("G League")
            entry["levels"].add("Professional")
            entry["seasons"].append({"source": "realgm_gleague", "season": canonical_season_label(season["season"]), "team": season["team"]})
        for season in profile.get("nba_seasons") or []:
            entry["levels"].add("NBA")
            entry["levels"].add("Professional")
            entry["seasons"].append({"source": "realgm_nba", "season": canonical_season_label(season["season"]), "team": season["team"]})

    for entry in profile_map.values():
        if "NBA" in entry["levels"] or (entry.get("professional_seasons") or []):
            entry["levels"].add("Professional")
        seasons_by_year: defaultdict[str, list[dict[str, object]]] = defaultdict(list)
        for season_entry in entry["seasons"]:
            season = canonical_season_label(season_entry.get("season"))
            team = clean_text(season_entry.get("team"))
            if not season and not team:
                continue
            end_year = canonical_end_year(season)
            if end_year and end_year < 1998:
                continue
            seasons_by_year[season].append({
                "source": clean_text(season_entry.get("source")),
                "season": season,
                "team": team,
            })

        ordered_entries: list[dict[str, object]] = []
        for season, season_entries in seasons_by_year.items():
            has_specific_team = any(normalize_key(item.get("team")) not in {"", "all", "all_teams", "allteam"} for item in season_entries)
            deduped_entries: dict[str, dict[str, object]] = {}
            for season_entry in season_entries:
                team = clean_text(season_entry.get("team"))
                if has_specific_team and normalize_key(team) in {"all", "all_teams", "allteam"}:
                    continue
                team_key = normalize_key(team) or team
                current = deduped_entries.get(team_key)
                if current is None:
                    deduped_entries[team_key] = season_entry
                    continue
                current_is_realgm = clean_text(current.get("source")).startswith("realgm_")
                candidate_is_realgm = clean_text(season_entry.get("source")).startswith("realgm_")
                if current_is_realgm and not candidate_is_realgm:
                    deduped_entries[team_key] = season_entry
            ordered_entries.extend(deduped_entries.values())

        ordered_entries.sort(key=lambda item: (extract_leading_year(item.get("season")), item.get("season"), item.get("team"), item.get("source")))
        entry["seasons"] = ordered_entries
        entry["career_path"] = " -> ".join(filter(None, [clean_text(item.get("team")) for item in ordered_entries]))[:1200]
        entry["profile_levels"] = " / ".join(sorted(entry["levels"], key=profile_level_sort_key))
    return {
        canonical_id: entry
        for canonical_id, entry in profile_map.items()
        if entry.get("seasons") or clean_text(entry.get("realgm_player_id"))
    }


def build_player_career_rows(
    site_data: dict[str, dict[str, object]],
    player_profiles: dict[str, dict[str, object]],
    grassroots_rows: list[dict[str, object]] | None = None,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    seen_site_keys = set()
    site_rows_by_player_season: defaultdict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)
    site_player_ids: set[str] = set()
    max_site_year = 0

    source_row_groups = [(dataset_id, bundle["rows"]) for dataset_id, bundle in site_data.items()]
    if grassroots_rows:
        source_row_groups.append(("grassroots", grassroots_rows))

    for dataset_id, source_rows in source_row_groups:
        for row in source_rows:
            max_site_year = max(max_site_year, canonical_end_year(row.get("season")))
            canonical_id = clean_text(row.get("_canonical_player_id"))
            if not canonical_id:
                continue
            profile = player_profiles.get(canonical_id, {})
            out = standardize_site_row_for_player_career(dataset_id, row, profile)
            key = player_career_source_key(out)
            if key in seen_site_keys:
                continue
            rows.append(out)
            seen_site_keys.add(key)
            site_rows_by_player_season[(canonical_id, clean_text(out.get("season")))].append(out)
            site_player_ids.add(canonical_id)

    realgm_rows = build_realgm_only_rows(player_profiles, seen_site_keys, site_rows_by_player_season, site_player_ids)
    rows.extend(realgm_rows)
    return [
        row for row in rows
        if canonical_end_year(row.get("season")) >= 1998
        and (not max_site_year or canonical_end_year(row.get("season")) <= max_site_year)
    ]


def standardize_site_row_for_player_career(dataset_id: str, row: dict[str, object], profile: dict[str, object]) -> dict[str, object]:
    player_name = clean_text(row.get("_player_name"))
    team_name = clean_text(row.get("_team_name"))
    season_label = canonical_season_label(row.get("season"))
    realgm_overlay = build_realgm_overlay_for_site_row(dataset_id, row, profile)
    ftr_value = first_non_blank(row.get("ftr"), row.get("fta_rate"))
    three_pr_value = first_non_blank(row.get("three_pr"), row.get("tpa_rate"))
    out = {
        "player_id": clean_text(row.get("_canonical_player_id")),
        "canonical_player_id": clean_text(row.get("_canonical_player_id")),
        "realgm_player_id": clean_text(row.get("realgm_player_id")),
        "source_player_id": clean_text(row.get("_source_player_id") or row.get("source_player_id") or row.get("player_id")),
        "player_profile_key": clean_text(row.get("player_profile_key")),
        "player_name": player_name,
        "season": season_label,
        "source_dataset": display_source_dataset(dataset_id),
        "competition_level": profile_level_for_dataset(dataset_id),
        "team_name": team_name or clean_text(row.get("team_alias")) or clean_text(row.get("team_full")),
        "team_full": clean_text(row.get("team_full") or row.get("team_alias_all") or team_name),
        "league": clean_text(row.get("league") or row.get("competition_label") or row.get("circuit")),
        "career_path": clean_text(profile.get("career_path")) or clean_text(row.get("team_full") or row.get("team_name")),
        "profile_levels": clean_text(profile.get("profile_levels")) or profile_level_for_dataset(dataset_id),
        "profile_match_source": clean_text(row.get("profile_match_source")),
        "realgm_summary_url": clean_text(profile.get("summary_url")) or clean_text(row.get("realgm_summary_url")),
        "nationality": clean_text(row.get("nationality")) or clean_text(profile.get("nationality")),
        "hometown": clean_text(row.get("hometown")) or clean_text(profile.get("hometown")),
        "high_school": clean_text(row.get("high_school")) or clean_text(profile.get("high_school")),
        "pre_draft_team": clean_text(profile.get("pre_draft_team")),
        "current_team": clean_text(profile.get("current_team")),
        "current_nba_status": clean_text(profile.get("current_nba_status")),
        "dob": clean_text(row.get("dob")) or clean_text(profile.get("born_iso")) or clean_text(realgm_overlay.get("dob")),
        "height_in": first_number(row.get("height_in"), row.get("inches"), profile.get("height_in")),
        "weight_lb": first_number(row.get("weight_lb"), row.get("weight"), profile.get("weight_lb")),
        "age": first_number(row.get("age"), realgm_overlay.get("age")),
        "pos": clean_text(row.get("pos") or row.get("pos_text")),
        "class_year": clean_text(row.get("class_year")) or clean_text(realgm_overlay.get("class_year")),
        "draft_pick": parse_int_value(row.get("draft_pick")),
        "rookie_year": parse_int_value(row.get("rookie_year")),
        "gp": first_number(row.get("gp"), row.get("g"), realgm_overlay.get("gp")),
        "min": first_number(row.get("min"), row.get("mp"), realgm_overlay.get("min")),
        "mpg": first_number(row.get("mpg"), realgm_overlay.get("mpg")),
        "pts": first_number(row.get("pts"), realgm_overlay.get("pts")),
        "trb": first_number(row.get("trb"), row.get("reb"), realgm_overlay.get("trb")),
        "orb": first_number(row.get("orb")),
        "drb": first_number(row.get("drb")),
        "ast": first_number(row.get("ast"), realgm_overlay.get("ast")),
        "stl": first_number(row.get("stl"), realgm_overlay.get("stl")),
        "blk": first_number(row.get("blk"), realgm_overlay.get("blk")),
        "tov": first_number(row.get("tov"), realgm_overlay.get("tov")),
        "pf": first_number(row.get("pf")),
        "fgm": first_number(row.get("fgm")),
        "fga": first_number(row.get("fga"), row.get("fg_att")),
        "two_pm": first_number(row.get("two_pm"), row.get("2pm"), row.get("two_p_made")),
        "two_pa": first_number(row.get("two_pa"), row.get("2pa"), row.get("two_p_att")),
        "three_pm": first_number(row.get("three_pm"), row.get("3pm"), row.get("tpm"), row.get("three_p_made")),
        "three_pa": first_number(row.get("three_pa"), row.get("3pa"), row.get("tpa"), row.get("three_p_att")),
        "ftm": first_number(row.get("ftm")),
        "fta": first_number(row.get("fta")),
        "fga_75": first_number(row.get("fga_75")),
        "fta_75": first_number(row.get("fta_75")),
        "fg3a_75": first_number(row.get("fg3a_75")),
        "fg_pct": first_non_blank(normalize_site_percent_value(dataset_id, "fg_pct", row.get("fg_pct")), realgm_overlay.get("fg_pct")),
        "two_p_pct": first_non_blank(normalize_site_percent_value(dataset_id, "two_p_pct", first_non_blank(row.get("two_p_pct"), row.get("2p_pct"), row.get("fg2pct"))), realgm_overlay.get("two_p_pct")),
        "three_p_pct": first_non_blank(normalize_site_percent_value(dataset_id, "three_p_pct", first_non_blank(row.get("3p_pct"), row.get("tp_pct"), row.get("fg3pct"))), realgm_overlay.get("three_p_pct")),
        "ft_pct": first_non_blank(normalize_site_percent_value(dataset_id, "ft_pct", first_non_blank(row.get("ft_pct"), row.get("ftpct"))), realgm_overlay.get("ft_pct")),
        "efg_pct": first_non_blank(normalize_site_percent_value(dataset_id, "efg_pct", first_non_blank(row.get("efg_pct"), row.get("efg"))), realgm_overlay.get("efg_pct")),
        "ts_pct": first_non_blank(normalize_site_percent_value(dataset_id, "ts_pct", first_non_blank(row.get("ts_pct"), row.get("tspct"))), realgm_overlay.get("ts_pct")),
        "ftr": normalize_ratio_field(ftr_value),
        "three_pr": normalize_ratio_field(three_pr_value),
        "rim_made": first_number(row.get("rim_made")),
        "rim_att": first_number(row.get("rim_att")),
        "rim_pct": normalize_site_percent_value(dataset_id, "rim_pct", first_non_blank(row.get("rim_pct"), row.get("fgpct_rim"))),
        "mid_made": first_number(row.get("mid_made")),
        "mid_att": first_number(row.get("mid_att")),
        "mid_pct": normalize_site_percent_value(dataset_id, "mid_pct", first_non_blank(row.get("mid_pct"), row.get("fgpct_mid"))),
        "adjoe": first_number(row.get("adjoe")),
        "adrtg": first_number(row.get("adrtg")),
        "porpag": first_number(row.get("porpag")),
        "dporpag": first_number(row.get("dporpag")),
        "bpm": first_number(row.get("bpm")),
        "per": first_number(row.get("per")),
        "rgm_per": first_number(row.get("rgm_per")),
        "off": first_number(row.get("off")),
        "def": first_number(row.get("def")),
        "tot": first_number(row.get("tot")),
        "ewins": first_number(row.get("ewins")),
        "orb_pct": first_non_blank(normalize_site_percent_value(dataset_id, "orb_pct", first_non_blank(row.get("orb_pct"), row.get("orbpct"))), realgm_overlay.get("orb_pct")),
        "drb_pct": first_non_blank(normalize_site_percent_value(dataset_id, "drb_pct", first_non_blank(row.get("drb_pct"), row.get("drbpct"))), realgm_overlay.get("drb_pct")),
        "trb_pct": first_non_blank(normalize_site_percent_value(dataset_id, "trb_pct", first_non_blank(row.get("trb_pct"))), realgm_overlay.get("trb_pct")),
        "ast_pct": first_non_blank(normalize_site_percent_value(dataset_id, "ast_pct", first_non_blank(row.get("ast_pct"), row.get("astpct"))), realgm_overlay.get("ast_pct")),
        "tov_pct": first_non_blank(normalize_site_percent_value(dataset_id, "tov_pct", first_non_blank(row.get("tov_pct"), row.get("topct"), row.get("tov_pct_adv"))), realgm_overlay.get("tov_pct")),
        "stl_pct": first_non_blank(normalize_site_percent_value(dataset_id, "stl_pct", first_non_blank(row.get("stl_pct"), row.get("stlpct"))), realgm_overlay.get("stl_pct")),
        "blk_pct": first_non_blank(normalize_site_percent_value(dataset_id, "blk_pct", first_non_blank(row.get("blk_pct"), row.get("blkpct"))), realgm_overlay.get("blk_pct")),
        "usg_pct": first_non_blank(normalize_site_percent_value(dataset_id, "usg_pct", first_non_blank(row.get("usg_pct"), row.get("usg"))), realgm_overlay.get("usg_pct")),
        "ast_to": first_number(row.get("ast_to")),
    }
    append_player_career_passthrough_fields(out, row)
    apply_player_career_shooting_derivations(out)
    apply_player_career_defensive_rate_derivations(out)
    fill_per_game_and_per40(out)
    return out


def append_player_career_passthrough_fields(out: dict[str, object], row: dict[str, object]) -> None:
    for column, value in row.items():
        column_key = clean_text(column)
        if not column_key or column_key.startswith("_"):
            continue
        if column_key in PLAYER_CAREER_PASSTHROUGH_SKIP_COLUMNS:
            continue
        if column_key in out:
            continue
        out[column_key] = value


def player_career_rows_look_duplicate(existing_row: dict[str, object], candidate_row: dict[str, object]) -> bool:
    existing_team_keys = build_school_keys(existing_row.get("team_name"))
    candidate_team_keys = build_school_keys(candidate_row.get("team_name"))
    if score_team_key_sets(existing_team_keys, candidate_team_keys) >= 0.66:
        return True
    gp_gap = abs_numeric_gap(existing_row.get("gp"), candidate_row.get("gp"))
    if not math.isfinite(gp_gap) or gp_gap > 0.25:
        return False
    min_gap = abs_numeric_gap(existing_row.get("min"), candidate_row.get("min"))
    if not math.isfinite(min_gap) or min_gap > 3.0:
        return False
    close_stats = 0
    for column, tolerance in (("pts", 3.0), ("trb", 1.5), ("ast", 1.5), ("stl", 1.0), ("blk", 1.0), ("tov", 1.0)):
        gap = abs_numeric_gap(existing_row.get(column), candidate_row.get(column))
        if math.isfinite(gap) and gap <= tolerance:
            close_stats += 1
    return close_stats >= 3


def build_realgm_only_rows(
    player_profiles: dict[str, dict[str, object]],
    seen_site_keys: set[str],
    site_rows_by_player_season: defaultdict[tuple[str, str], list[dict[str, object]]],
    site_player_ids: set[str],
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []

    for canonical_id, profile in player_profiles.items():
        realgm_player_id = clean_text(profile.get("realgm_player_id"))
        if not realgm_player_id:
            continue
        source_groups = [
            ("realgm_international", profile.get("intl_seasons") or []),
            ("realgm_gleague", profile.get("gleague_seasons") or []),
            ("realgm_nba", profile.get("nba_seasons") or []),
        ]
        if canonical_id not in site_player_ids and (profile.get("college_seasons") or []):
            source_groups.insert(0, ("realgm_college", profile.get("college_seasons") or []))
        for source_name, season_entries in source_groups:
            for entry in season_entries:
                season_row = entry.get("stats") if isinstance(entry, dict) else {}
                if not isinstance(season_row, dict):
                    continue
                out = standardize_realgm_row_for_player_career(source_name, canonical_id, profile, profile, season_row)
                site_rows = site_rows_by_player_season.get((canonical_id, clean_text(out.get("season"))), [])
                if any(player_career_rows_look_duplicate(existing_row, out) for existing_row in site_rows):
                    continue
                key = player_career_source_key(out)
                if key in seen_site_keys:
                    continue
                seen_site_keys.add(key)
                rows.append(out)
                site_rows_by_player_season[(canonical_id, clean_text(out.get("season")))].append(out)
    return rows


def standardize_realgm_row_for_player_career(source_name: str, canonical_id: str, profile: dict[str, object], player_info: dict[str, object], season_row: dict[str, object]) -> dict[str, object]:
    team_name = clean_text(season_row.get("school") or season_row.get("team") or season_row.get("league"))
    gp = to_float(season_row.get("gp"))
    mpg = to_float(season_row.get("min"))
    pts_pg = to_float(season_row.get("pts"))
    reb_pg = first_number(season_row.get("trb"), season_row.get("reb"))
    ast_pg = to_float(season_row.get("ast"))
    stl_pg = to_float(season_row.get("stl"))
    blk_pg = to_float(season_row.get("blk"))
    tov_pg = to_float(season_row.get("tov"))
    out = {
        "player_id": canonical_id,
        "canonical_player_id": canonical_id,
        "realgm_player_id": clean_text(profile.get("realgm_player_id")),
        "source_player_id": "",
        "player_profile_key": "",
        "player_name": clean_display_name(season_row.get("player_name")) or clean_text(profile.get("player_name")),
        "season": canonical_season_label(season_row.get("season")),
        "source_dataset": display_source_dataset(source_name),
        "competition_level": derive_realgm_competition_level(source_name, team_name),
        "team_name": team_name,
        "team_full": team_name,
        "league": clean_text(season_row.get("league")),
        "career_path": clean_text(profile.get("career_path")),
        "profile_levels": clean_text(profile.get("profile_levels")),
        "profile_match_source": "realgm_only",
        "realgm_summary_url": clean_text(profile.get("summary_url")),
        "nationality": clean_text(profile.get("nationality")),
        "hometown": clean_text(profile.get("hometown")),
        "high_school": clean_text(profile.get("high_school")),
        "pre_draft_team": clean_text(profile.get("pre_draft_team")),
        "current_team": clean_text(profile.get("current_team")),
        "current_nba_status": clean_text(profile.get("current_nba_status")),
        "dob": clean_text(profile.get("born_iso")) or parse_date_to_iso(player_info.get("born")),
        "height_in": profile.get("height_in") or parse_height_to_inches(player_info.get("height")),
        "weight_lb": profile.get("weight_lb") or parse_weight_to_lb(player_info.get("weight")),
        "age": to_float(season_row.get("age")),
        "pos": clean_text(profile.get("position")) or clean_text(player_info.get("position")),
        "class_year": clean_text(season_row.get("class")),
        "draft_pick": "",
        "rookie_year": "",
        "gp": gp,
        "min": round_number((gp * mpg), 3) if gp is not None and mpg is not None else "",
        "mpg": mpg,
        "pts": round_number((gp * pts_pg), 3) if gp is not None and pts_pg is not None else "",
        "trb": round_number((gp * reb_pg), 3) if gp is not None and reb_pg is not None else "",
        "orb": "",
        "drb": "",
        "ast": round_number((gp * ast_pg), 3) if gp is not None and ast_pg is not None else "",
        "stl": round_number((gp * stl_pg), 3) if gp is not None and stl_pg is not None else "",
        "blk": round_number((gp * blk_pg), 3) if gp is not None and blk_pg is not None else "",
        "tov": round_number((gp * tov_pg), 3) if gp is not None and tov_pg is not None else "",
        "pf": "",
        "fgm": "",
        "fga": "",
        "two_pm": "",
        "two_pa": "",
        "three_pm": "",
        "three_pa": "",
        "ftm": "",
        "fta": "",
        "fga_75": "",
        "fta_75": "",
        "fg3a_75": "",
        "fg_pct": normalize_site_percent_value("realgm", "fg_pct", first_non_blank(season_row.get("fg"), season_row.get("fg_pct"))),
        "two_p_pct": "",
        "three_p_pct": normalize_site_percent_value("realgm", "three_p_pct", first_non_blank(season_row.get("3p"), season_row.get("3p_pct"))),
        "ft_pct": normalize_site_percent_value("realgm", "ft_pct", first_non_blank(season_row.get("ft"), season_row.get("ft_pct"))),
        "efg_pct": "",
        "ts_pct": "",
        "ftr": "",
        "three_pr": "",
        "rim_made": "",
        "rim_att": "",
        "rim_pct": "",
        "mid_made": "",
        "mid_att": "",
        "mid_pct": "",
        "adjoe": "",
        "adrtg": "",
        "porpag": "",
        "dporpag": "",
        "bpm": "",
        "per": "",
        "rgm_per": "",
        "off": "",
        "def": "",
        "tot": "",
        "ewins": "",
        "orb_pct": "",
        "drb_pct": "",
        "trb_pct": "",
        "ast_pct": "",
        "tov_pct": "",
        "stl_pct": "",
        "blk_pct": "",
        "usg_pct": "",
        "ast_to": "",
        "pts_pg": pts_pg,
        "trb_pg": reb_pg,
        "ast_pg": ast_pg,
        "stl_pg": stl_pg,
        "blk_pg": blk_pg,
        "tov_pg": tov_pg,
        "pts_per40": "",
        "trb_per40": "",
        "ast_per40": "",
        "stl_per40": "",
        "blk_per40": "",
    }
    apply_player_career_shooting_derivations(out)
    fill_per40_only(out)
    return out


def write_rewritten_site_bundles(site_data: dict[str, dict[str, object]]) -> None:
    identity_columns = ["canonical_player_id", "player_profile_key", "source_player_id", "realgm_player_id", "realgm_summary_url", "profile_match_source", "profile_career_path", "profile_levels"]
    for dataset_id, bundle in site_data.items():
        config = bundle["config"]
        rows = bundle["rows"]
        original_columns = [column for column in bundle["columns"] if not column.startswith("_")]
        extra_columns = [column for column in identity_columns if column not in original_columns]
        if dataset_id in {"d2", "naia", "juco", "fiba"}:
            extra_columns += [column for column in SHOT_PROFILE_COLUMNS if column not in original_columns and column not in extra_columns]
        columns = original_columns + extra_columns
        write_js_csv_rows(config["path"], config["global_name"], rows, columns)


def write_outputs(player_profiles: dict[str, dict[str, object]], player_career_rows: list[dict[str, object]], team_alias_map: dict[str, dict[str, object]], team_alias_details: dict[str, dict[str, object]], site_data: dict[str, dict[str, object]], profiles: dict[str, dict[str, object]], summary: dict[str, object]) -> None:
    profile_records = []
    for profile in sorted(player_profiles.values(), key=lambda item: (normalize_name_key(item.get("player_name")), item.get("canonical_player_id"))):
        profile_records.append({
            "canonical_player_id": profile["canonical_player_id"],
            "realgm_player_id": clean_text(profile.get("realgm_player_id")),
            "player_name": clean_text(profile.get("player_name")),
            "born_iso": clean_text(profile.get("born_iso")),
            "height_in": profile.get("height_in") or "",
            "weight_lb": profile.get("weight_lb") or "",
            "nationality": clean_text(profile.get("nationality")),
            "high_school": clean_text(profile.get("high_school")),
            "hometown": clean_text(profile.get("hometown")),
            "pre_draft_team": clean_text(profile.get("pre_draft_team")),
            "current_team": clean_text(profile.get("current_team")),
            "current_nba_status": clean_text(profile.get("current_nba_status")),
            "summary_url": clean_text(profile.get("summary_url")),
            "profile_levels": clean_text(profile.get("profile_levels")),
            "career_path": clean_text(profile.get("career_path")),
            "season_count": len(profile.get("seasons") or []),
        })
    (GENERATED_DIR / "player_profiles.json").write_text(json.dumps(profile_records, indent=2), encoding="utf-8")
    (GENERATED_DIR / "player_profiles.csv").write_text(dict_rows_to_csv(profile_records), encoding="utf-8")
    (GENERATED_DIR / "player_career_rows.csv").write_text(dict_rows_to_csv(player_career_rows), encoding="utf-8")

    alias_records = []
    for alias_key, record in sorted(team_alias_map.items()):
        alias_records.append({
            "alias_key": alias_key,
            "alias": record["alias"],
            "canonical_team_name": record["canonical_team_name"],
            "source": record["source"],
            "level": record["level"],
            "confidence": record["confidence"],
        })
    (GENERATED_DIR / "team_aliases.json").write_text(json.dumps(alias_records, indent=2), encoding="utf-8")
    (GENERATED_DIR / "team_aliases.csv").write_text(dict_rows_to_csv(alias_records), encoding="utf-8")

    manifest = {
        "workspace_root": str(SITE_DATA_ROOT),
        "sources": {
            "realgm_reference": {
                "path": str(REALGM_REFERENCE_ROOT),
                "files": [str(path) for path in [REALGM_REFERENCE_PLAYERS_PATH, REALGM_REFERENCE_ROWS_PATH] if path.is_file()],
                "notes": "Merged reference export used for cross-level player identity and professional-season linkage.",
            },
            "realgm_college": {
                "path": str(REALGM_ROOT),
                "files": [str(path) for path in get_realgm_source_paths()],
                "notes": "College crawl source family used for supplemental player metadata and legacy season fallbacks.",
            },
            "realgm_nba": {
                "path": str(REALGM_NBA_ROOT),
                "files": [str(path) for path in [REALGM_NBA_ROOT / filename for filename in ("players.csv", "totals_rows.csv", "advanced_rows.csv")] if path.is_file()],
                "notes": "NBA/G League/international RealGM crawl used to enrich professional linkage and season overlays.",
            },
            "rim_data": {
                "path": str(RIM_ROOT),
                "notes": "Synergy-sourced rim profile CSVs for D2, JUCO, NAIA, and FIBA youth competitions.",
            },
            "barttorvik": {
                "path": str(BARTTORVIK_DIR),
                "notes": "Used for D1 team-name alias coverage.",
            },
            "nba_epm": {
                "path": str(NBA_EPM_DIR),
                "notes": "Underlying season-level NBA EPM source family used by the existing NBA site bundle.",
            },
            "site_bundles": {
                dataset_id: str(bundle["config"]["path"])
                for dataset_id, bundle in site_data.items()
            },
        },
        "outputs": {
            "rewritten_site_bundles": {dataset_id: str(bundle["config"]["path"]) for dataset_id, bundle in site_data.items()},
            "player_career_year_manifest": str(PLAYER_CAREER_YEAR_MANIFEST_PATH),
            "player_career_year_chunks": str(PLAYER_CAREER_YEAR_CHUNK_DIR),
            "player_profiles_json": str(GENERATED_DIR / "player_profiles.json"),
            "team_aliases_json": str(GENERATED_DIR / "team_aliases.json"),
        },
        "summary": summary,
    }
    (MANIFEST_DIR / "sources.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    unresolved = []
    for dataset_id, bundle in site_data.items():
        grouped = group_rows_by_identity(bundle["rows"])
        for group_rows in grouped:
            if group_rows[0].get("_match_source") != "fallback":
                continue
            representative = sorted(group_rows, key=identity_row_score, reverse=True)[0]
            unresolved.append({
                "dataset_id": dataset_id,
                "player_name": clean_text(representative.get("_player_name")),
                "season": clean_text(representative.get("season")),
                "team_name": clean_text(representative.get("_team_name")),
                "canonical_player_id": clean_text(representative.get("_canonical_player_id")),
            })
    (GENERATED_DIR / "unmatched_identity_groups.csv").write_text(dict_rows_to_csv(unresolved), encoding="utf-8")
    if PLAYER_CAREER_BUNDLE_PATH.exists():
        PLAYER_CAREER_BUNDLE_PATH.unlink()


def load_js_csv_rows(path: Path, global_name: str) -> tuple[list[dict[str, object]], list[str]]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"=\s*(.+?);\s*$", text, re.S)
    if not match:
        raise ValueError(f"Unable to parse JS bundle: {path}")
    payload = json.loads(match.group(1).strip())
    csv_text = "\n".join(payload) if isinstance(payload, list) else str(payload)
    rows = parse_csv_text(csv_text)
    columns = rows[0].keys() if rows else []
    return rows, list(columns)


def write_js_csv_rows(path: Path, global_name: str, rows: list[dict[str, object]], columns: list[str]) -> None:
    csv_text = dict_rows_to_csv(rows, columns)
    path.write_text(f"window.{global_name} = {json.dumps(csv_text)};\n", encoding="utf-8")


def load_js_chunk_csv_rows(path: Path, chunk_store_name: str) -> list[dict[str, object]]:
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"{re.escape(chunk_store_name)}\[[^\]]+\]\s*=\s*(.+?);\s*$", text, re.S)
    if not match:
        raise ValueError(f"Unable to parse JS chunk bundle: {path}")
    payload = json.loads(match.group(1).strip())
    csv_text = "\n".join(payload) if isinstance(payload, list) else str(payload)
    return parse_csv_text(csv_text)


def load_grassroots_rows_from_chunks() -> list[dict[str, object]]:
    if not GRASSROOTS_YEAR_CHUNK_DIR.exists():
        return []
    rows: list[dict[str, object]] = []
    chunk_files = sorted(
        (path for path in GRASSROOTS_YEAR_CHUNK_DIR.glob("*.js") if path.is_file()),
        key=lambda item: (extract_leading_year(item.stem), item.stem),
    )
    for file_path in chunk_files:
        rows.extend(load_js_chunk_csv_rows(file_path, "GRASSROOTS_YEAR_CSV_CHUNKS"))
    return rows


def load_plain_csv_rows(path: Path) -> list[dict[str, object]]:
    return parse_csv_text(path.read_text(encoding="utf-8", errors="ignore"))


def get_realgm_source_paths() -> list[Path]:
    paths: list[Path] = []
    for root in (REALGM_PRIMARY_ROOT, REALGM_SECONDARY_ROOT):
        if not root.exists():
            continue
        for filename in ("players.csv", "player_seasons.csv", "international_player_seasons.csv"):
            paths.extend(sorted(path for path in root.glob(f"shard_*/{filename}") if path.is_file()))
    for filename in ("players.csv", "player_seasons.csv", "international_player_seasons.csv"):
        path = REALGM_SUPPLEMENTAL_ROOT / filename
        if path.is_file():
            paths.append(path)
    seen: set[Path] = set()
    ordered: list[Path] = []
    for path in paths:
        if path in seen:
            continue
        seen.add(path)
        ordered.append(path)
    return ordered


def load_realgm_csv_rows(filename: str) -> list[dict[str, object]]:
    key_fields_by_filename = {
        "players.csv": ["realgm_player_id"],
        "player_seasons.csv": ["realgm_player_id", "season", "school", "team", "league", "stats_scope"],
        "international_player_seasons.csv": ["realgm_player_id", "season", "team", "school", "league", "stats_scope"],
    }
    key_fields = key_fields_by_filename.get(filename, [])
    merged: dict[tuple[str, ...], dict[str, object]] = {}
    rows: list[dict[str, object]] = []
    for path in get_realgm_source_paths():
        if path.name != filename:
            continue
        for row in load_plain_csv_rows(path):
            if not key_fields:
                rows.append(row)
                continue
            key = tuple(clean_text(row.get(field)) for field in key_fields)
            if not any(key):
                continue
            current = merged.get(key)
            if current is None or count_non_blank_fields(row) > count_non_blank_fields(current):
                merged[key] = row
    return list(merged.values()) if key_fields else rows


def parse_csv_text(text: str) -> list[dict[str, object]]:
    lines = text.splitlines()
    if lines and lines[0].strip().lower().startswith("sep="):
        text = "\n".join(lines[1:])
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


def count_non_blank_fields(row: dict[str, object]) -> int:
    return sum(1 for value in row.values() if clean_text(value))


def dict_rows_to_csv(rows: list[dict[str, object]], columns: list[str] | None = None) -> str:
    if not rows:
        return ""
    if columns is None:
        ordered = []
        seen = set()
        for row in rows:
            for column in row.keys():
                if column.startswith("_") or column in seen:
                    continue
                seen.add(column)
                ordered.append(column)
        columns = ordered
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(columns)
    for row in rows:
        writer.writerow([serialize_csv_value(row.get(column, "")) for column in columns])
    return output.getvalue()


def serialize_csv_value(value: object) -> object:
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        if value.is_integer():
            return int(value)
        return round(value, 6)
    return value


def season_from_hyphen_file(file_name: str) -> str:
    match = re.search(r"(\d{4})-(\d{4})", file_name)
    return f"{match.group(1)}-{match.group(2)[-2:]}" if match else ""


def season_from_national_file(file_name: str) -> str:
    match = re.search(r"National Teams\s+(\d{4})", file_name, re.I)
    return match.group(1) if match else ""


def get_site_season_start(dataset_id: str, season_value: object) -> int:
    text = clean_text(season_value)
    year = extract_leading_year(text)
    if not year:
        return 0
    if dataset_id in {"d1", "nba"} and re.fullmatch(r"\d{4}", text):
        return year - 1
    return year


def clean_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def clean_display_name(value: object) -> str:
    text = re.sub(r"\s+", " ", clean_text(value)).strip()
    if not text:
        return ""
    if "," in text:
        parts = [part.strip() for part in text.split(",") if part.strip()]
        if len(parts) == 2:
            text = f"{parts[1]} {parts[0]}"
        elif len(parts) >= 3:
            text = f"{parts[1]} {parts[0]} {' '.join(parts[2:])}"
    text = re.sub(r"\s+", " ", text).strip()
    tokens = [normalize_display_name_token(token) for token in re.split(r"(\s+|-|')", text)]
    text = "".join(tokens)
    text = re.sub(r"\bMc([a-z])", lambda match: f"Mc{match.group(1).upper()}", text)
    text = re.sub(r"\bO'([a-z])", lambda match: f"O'{match.group(1).upper()}", text)
    text = re.sub(r"\bJR\.?$", "Jr.", text, flags=re.I)
    text = re.sub(r"\bSR\.?$", "Sr.", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip(" ,;/")


def is_valid_player_name(value: object) -> bool:
    text = clean_display_name(value)
    if not text:
        return False
    key = normalize_key(text)
    compact = key.replace(" ", "")
    if not compact or compact in {"tm", "team", "totals", "total", "unknown", "na", "n a", "none", "player"}:
        return False
    if re.fullmatch(r"\d+", compact):
        return False
    return len(compact) >= 3


def normalize_display_name_token(token: str) -> str:
    bare = re.sub(r"[^A-Za-z]", "", token)
    if not bare:
        return token
    if re.fullmatch(r"(ii|iii|iv|v|vi|vii|viii|ix|x)", bare, re.I):
        return token.replace(bare, bare.upper())
    if len(bare) == 1:
        return token.upper()
    if re.fullmatch(r"[A-Za-z]\.?[A-Za-z]\.?", token):
        return bare.upper()
    lower = token.lower()
    return lower[:1].upper() + lower[1:]


def normalize_key(value: object) -> str:
    text = clean_text(value).lower()
    text = text.replace("&amp;", "&").replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_name_key(value: object) -> str:
    text = normalize_key(value)
    text = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_loose_name_key(value: object) -> str:
    text = normalize_name_key(value)
    text = re.sub(r"\b[a-z]\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokenize_person_name(value: object) -> list[str]:
    return [token for token in normalize_loose_name_key(value).split(" ") if token]


def name_similarity_ratio(left: object, right: object) -> float:
    return SequenceMatcher(None, clean_text(left), clean_text(right)).ratio()


def first_name_matches_with_nickname(left: str, right: str) -> bool:
    if not left or not right:
        return False
    if left == right:
        return True
    nickname_map = {
        "alex": {"alexander"},
        "cam": {"cameron"},
        "cameron": {"cam"},
        "mike": {"michael"},
        "michael": {"mike"},
        "nick": {"nicholas"},
        "nicholas": {"nick"},
        "rob": {"robert"},
        "robert": {"rob"},
        "steph": {"stephen"},
        "stephen": {"steph"},
        "tim": {"timothy"},
        "timothy": {"tim"},
        "tony": {"anthony"},
        "anthony": {"tony"},
        "will": {"william"},
        "william": {"will"},
    }
    return right in nickname_map.get(left, set()) or left in nickname_map.get(right, set())


def score_fuzzy_d1_name_match(row: dict[str, object], profile: dict[str, object]) -> float:
    row_name_key = clean_text(row.get("_name_key"))
    profile_name_key = clean_text(profile.get("name_key"))
    row_loose = clean_text(row.get("_loose_name_key"))
    profile_loose = clean_text(profile.get("loose_name_key"))
    if row_name_key and row_name_key == profile_name_key:
        return 96.0
    if row_loose and row_loose == profile_loose:
        return 82.0

    row_tokens = tokenize_person_name(row.get("_player_name"))
    profile_tokens = tokenize_person_name(profile.get("player_name"))
    if len(row_tokens) < 2 or len(profile_tokens) < 2:
        return 0.0

    row_first = row_tokens[0]
    row_last = row_tokens[-1]
    profile_first = profile_tokens[0]
    profile_last = profile_tokens[-1]
    same_first = first_name_matches_with_nickname(row_first, profile_first)
    shared_tokens = set(row_tokens) & set(profile_tokens)
    subset_match = set(row_tokens).issubset(set(profile_tokens)) or set(profile_tokens).issubset(set(row_tokens))
    last_ratio = name_similarity_ratio(row_last, profile_last)
    full_ratio = name_similarity_ratio(" ".join(row_tokens), " ".join(profile_tokens))
    loose_ratio = name_similarity_ratio(row_loose, profile_loose)

    if same_first and subset_match and len(shared_tokens) >= 2:
        return 78.0
    if same_first and last_ratio >= 0.84:
        return 74.0
    if row_first[:1] == profile_first[:1] and row_last == profile_last:
        return 68.0
    if full_ratio >= 0.92:
        return 66.0
    if same_first and loose_ratio >= 0.82:
        return 60.0
    return 0.0


def parse_height_to_inches(value: object) -> float | None:
    text = clean_text(value)
    if not text:
        return None
    match = re.search(r"(\d+)\s*[-']\s*(\d+)", text)
    if match:
        return (int(match.group(1)) * 12) + int(match.group(2))
    match = re.search(r"(\d+)\s*ft\s*(\d+)", text, re.I)
    if match:
        return (int(match.group(1)) * 12) + int(match.group(2))
    numeric = to_float(text)
    if numeric is not None and 48 <= numeric <= 96:
        return numeric
    return None


def parse_weight_to_lb(value: object) -> float | None:
    text = clean_text(value)
    if not text:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)\s*lb", text, re.I)
    if match:
        return float(match.group(1))
    numeric = to_float(text)
    if numeric is not None and 80 <= numeric <= 400:
        return numeric
    return None


def parse_date_to_iso(value: object) -> str:
    text = clean_text(value)
    if not text:
        return ""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text
    from datetime import datetime
    for pattern in ("%b %d, %Y", "%B %d, %Y", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, pattern).date().isoformat()
        except ValueError:
            continue
    return ""


def extract_leading_year(value: object) -> int:
    match = re.search(r"\d{4}", clean_text(value))
    return int(match.group(0)) if match else 0


def canonical_end_year(value: object) -> int:
    text = clean_text(value)
    if not text:
        return 0
    match = re.search(r"(\d{4})\s*[-/]\s*(\d{2,4})", text)
    if match:
        end_part = match.group(2)
        return int(f"20{end_part}" if len(end_part) == 2 else end_part)
    years = re.findall(r"\d{4}", text)
    if years:
        return int(years[-1])
    numeric = to_float(text)
    return int(round(numeric)) if numeric is not None else 0


def canonical_season_label(value: object) -> str:
    year = canonical_end_year(value)
    return str(year) if year else clean_text(value)


def to_float(value: object) -> float | None:
    text = clean_text(value)
    if not text:
        return None
    text = text.replace(",", "")
    try:
        return float(text)
    except ValueError:
        return None


def parse_int_value(value: object) -> int | None:
    numeric = to_float(value)
    if numeric is None or not math.isfinite(numeric):
        return None
    return int(round(numeric))


def first_number(*values: object) -> float | None:
    for value in values:
        if isinstance(value, (int, float)):
            if math.isfinite(float(value)):
                return float(value)
            continue
        numeric = to_float(value)
        if numeric is not None and math.isfinite(numeric):
            return numeric
    return None


def positive_number(*values: object) -> float | None:
    numeric = first_number(*values)
    if numeric is None or not math.isfinite(numeric) or numeric <= 0:
        return None
    return numeric


def first_non_blank(*values: object) -> object:
    for value in values:
        if clean_text(value):
            return value
    return ""


def round_number(value: float | None, digits: int = 3) -> float | str:
    if value is None or not math.isfinite(value):
        return ""
    rounded = round(value, digits)
    if digits == 0:
        return int(rounded)
    if float(rounded).is_integer():
        return int(rounded)
    return rounded


def normalize_percent_value(value: object, scale: str = "auto") -> float | str:
    numeric = to_float(value)
    if numeric is None:
        return ""
    if scale == "ratio":
        numeric *= 100.0
    elif scale == "auto" and abs(numeric) <= 1.5:
        numeric *= 100.0
    return round_number(numeric, 3)


def normalize_site_percent_value(dataset_id: str, column: str, value: object) -> float | str:
    column_key = clean_text(column)
    d1_ratio_columns = {"fg_pct", "two_p_pct", "three_p_pct", "ft_pct", "efg_pct", "ts_pct", "rim_pct", "mid_pct"}
    d2_ratio_columns = {
        "fg_pct", "3p_pct", "ft_pct", "efg_pct", "ts_pct", "tpa_rate", "fta_rate",
        "usg_pct", "orb_pct", "drb_pct", "trb_pct", "ast_pct", "tov_pct", "stl_pct", "blk_pct",
    }
    nba_ratio_columns = {
        "usg", "tspct", "efg", "fgpct_rim", "fgpct_mid", "fg2pct", "fg3pct", "ftpct",
        "orbpct", "drbpct", "astpct", "topct", "stlpct", "blkpct",
    }
    if dataset_id == "d1" and column_key in d1_ratio_columns:
        return normalize_percent_value(value, "ratio")
    if dataset_id == "d2" and column_key in d2_ratio_columns:
        return normalize_percent_value(value, "ratio")
    if dataset_id == "nba" and column_key in nba_ratio_columns:
        return normalize_percent_value(value, "ratio")
    if dataset_id == "realgm":
        return normalize_percent_value(value, "ratio")
    return normalize_percent_value(value, "percent")


def zero_safe_percent(made: float | None, attempts: float | None) -> float:
    if made is None or attempts is None or attempts <= 0:
        return 0.0
    return (made / attempts) * 100.0


def ratio_value(value: object) -> float | None:
    numeric = first_number(value)
    if numeric is None or not math.isfinite(numeric):
        return None
    return numeric if abs(numeric) <= 1.5 else (numeric / 100.0)


def weighted_point_total(two_pm: object, three_pm: object, ftm: object) -> float | None:
    two_pm_value = first_number(two_pm)
    three_pm_value = first_number(three_pm)
    ftm_value = first_number(ftm)
    if two_pm_value is None and three_pm_value is None and ftm_value is None:
        return None
    return (two_pm_value or 0.0) * 2.0 + (three_pm_value or 0.0) * 3.0 + (ftm_value or 0.0)


def zero_safe_efg_pct(fgm: object, three_pm: object, fga: object) -> float | None:
    fga_value = first_number(fga)
    if fga_value is None or not math.isfinite(fga_value):
        return None
    if fga_value <= 0:
        return 0.0
    fgm_value = first_number(fgm)
    if fgm_value is None or not math.isfinite(fgm_value):
        return None
    three_pm_value = first_number(three_pm) or 0.0
    return ((fgm_value + (0.5 * three_pm_value)) / fga_value) * 100.0


def zero_safe_ts_pct(points: object, fga: object, fta: object) -> float | None:
    fga_value = first_number(fga)
    fta_value = first_number(fta)
    if fga_value is None or fta_value is None or not math.isfinite(fga_value) or not math.isfinite(fta_value):
        return None
    denom = 2.0 * (fga_value + (0.44 * fta_value))
    if denom <= 0:
        return 0.0
    points_value = first_number(points)
    if points_value is None or not math.isfinite(points_value):
        return None
    return (points_value / denom) * 100.0


def normalize_ratio_field(value: object) -> float | str:
    numeric = ratio_value(value)
    return round_number(numeric, 3) if numeric is not None else ""


def get_team_minutes_basis(row: dict[str, object]) -> float | None:
    team_minutes = first_number(row.get("team_minutes"))
    if team_minutes is not None and math.isfinite(team_minutes) and team_minutes > 0:
        return team_minutes
    gp_value = first_number(row.get("gp"), row.get("g"))
    if gp_value is not None and math.isfinite(gp_value) and gp_value > 0:
        return gp_value * 200.0
    return None


def apply_player_career_defensive_rate_derivations(row: dict[str, object]) -> None:
    minutes_value = first_number(row.get("min"), row.get("mp"))
    team_minutes = get_team_minutes_basis(row)
    if minutes_value is None or team_minutes is None or minutes_value <= 0 or team_minutes <= 0:
        return

    steal_pct = first_number(row.get("stl_pct"))
    stl_value = first_number(row.get("stl"))
    opp_poss = first_number(row.get("opp_poss"))
    if steal_pct is None and stl_value is not None and opp_poss is not None and opp_poss > 0:
        row["stl_pct"] = round_number((stl_value * ((team_minutes / 5.0) / minutes_value) / opp_poss) * 100.0, 3)

    block_pct = first_number(row.get("blk_pct"))
    blk_value = first_number(row.get("blk"))
    opp_fga = first_number(row.get("opp_fga"))
    opp_3pa = first_number(row.get("opp_3pa"))
    if block_pct is None and blk_value is not None and opp_fga is not None and opp_3pa is not None and (opp_fga - opp_3pa) > 0:
        row["blk_pct"] = round_number((blk_value * ((team_minutes / 5.0) / minutes_value) / (opp_fga - opp_3pa)) * 100.0, 3)


def apply_player_career_shooting_derivations(row: dict[str, object]) -> None:
    two_pm = first_number(row.get("two_pm"), row.get("2pm"))
    two_pa = first_number(row.get("two_pa"), row.get("2pa"))
    three_pm = first_number(row.get("three_pm"), row.get("3pm"), row.get("tpm"))
    three_pa = first_number(row.get("three_pa"), row.get("3pa"), row.get("tpa"))
    fga = first_number(row.get("fga"), row.get("fga_75"), add_numbers(two_pa, three_pa))
    if three_pa is None:
        three_pa = first_number(row.get("fg3a_75"))
    if three_pa is None and fga is not None:
        three_pr_ratio = ratio_value(row.get("three_pr"))
        if three_pr_ratio is None:
            three_pr_ratio = first_number(divide_numbers(row.get("fg3a_75"), row.get("fga_75")))
        if three_pr_ratio is not None:
            three_pa = fga * three_pr_ratio
    if two_pa is None and fga is not None and three_pa is not None:
        two_pa = max(0.0, fga - three_pa)

    two_pct_ratio = ratio_value(row.get("two_p_pct"))
    three_pct_ratio = ratio_value(row.get("three_p_pct"))
    if three_pm is None and three_pa is not None and three_pct_ratio is not None:
        three_pm = three_pa * three_pct_ratio
    if three_pm is None and three_pa == 0:
        three_pm = 0.0
    fgm = first_number(row.get("fgm"), add_numbers(two_pm, three_pm))
    if three_pm is None and fgm is not None and two_pm is not None:
        three_pm = max(0.0, fgm - two_pm)
    if two_pm is None and fgm is not None and three_pm is not None:
        two_pm = max(0.0, fgm - three_pm)
    if two_pm is None and two_pa is not None and two_pct_ratio is not None:
        two_pm = two_pa * two_pct_ratio
    if two_pm is None and two_pa == 0:
        two_pm = 0.0
    if three_pm is None and fgm is not None and two_pm is not None:
        three_pm = max(0.0, fgm - two_pm)
    fgm = first_number(row.get("fgm"), add_numbers(two_pm, three_pm))
    if first_number(row.get("fgm")) is None and fgm is not None:
        row["fgm"] = round_number(fgm, 3)
    if first_number(row.get("fga")) is None and fga is not None:
        row["fga"] = round_number(fga, 3)
    if first_number(row.get("two_pa")) is None and two_pa is not None:
        row["two_pa"] = round_number(two_pa, 3)
    if first_number(row.get("three_pa")) is None and three_pa is not None:
        row["three_pa"] = round_number(three_pa, 3)
    if first_number(row.get("two_pm")) is None and two_pm is not None:
        row["two_pm"] = round_number(two_pm, 3)
    if first_number(row.get("three_pm")) is None and three_pm is not None:
        row["three_pm"] = round_number(three_pm, 3)

    ftr_ratio = ratio_value(row.get("ftr"))
    if ftr_ratio is None:
        ftr_ratio = first_number(divide_numbers(row.get("fta"), row.get("fga")), divide_numbers(row.get("fta_75"), row.get("fga_75")))
    if ftr_ratio is None and first_number(row.get("fga")) == 0:
        ftr_ratio = 0.0
    if ftr_ratio is not None:
        row["ftr"] = round_number(ftr_ratio, 3)

    three_pr_ratio = ratio_value(row.get("three_pr"))
    if three_pr_ratio is None:
        three_pr_ratio = first_number(divide_numbers(row.get("three_pa"), row.get("fga")), divide_numbers(row.get("fg3a_75"), row.get("fga_75")))
    if three_pr_ratio is None and first_number(row.get("fga")) == 0:
        three_pr_ratio = 0.0
    if three_pr_ratio is not None:
        row["three_pr"] = round_number(three_pr_ratio, 3)

    total_fga = first_number(row.get("fga"))
    if first_number(row.get("fta")) is None and total_fga is not None and ftr_ratio is not None:
        row["fta"] = round_number(total_fga * ftr_ratio, 3)
    if first_number(row.get("fta")) is None and first_number(row.get("fta_75")) is not None:
        row["fta"] = round_number(first_number(row.get("fta_75")), 3)
    ft_pct_ratio = ratio_value(row.get("ft_pct"))
    if first_number(row.get("ftm")) is None and first_number(row.get("fta")) is not None and ft_pct_ratio is not None:
        row["ftm"] = round_number(first_number(row.get("fta")) * ft_pct_ratio, 3)
    if first_number(row.get("ftm")) is None and first_number(row.get("fta")) == 0:
        row["ftm"] = 0
    if first_number(row.get("fta")) is None and first_number(row.get("ftm")) == 0 and ft_pct_ratio is None:
        row["fta"] = 0

    points_value = first_number(row.get("pts"))
    if first_number(row.get("ftm")) is None and points_value is not None and two_pm is not None and three_pm is not None:
        row["ftm"] = round_number(max(0.0, points_value - (two_pm * 2.0) - (three_pm * 3.0)), 3)
    if first_number(row.get("fta")) is None and first_number(row.get("ftm")) == 0:
        row["fta"] = 0

    if first_number(row.get("pts")) is None:
        inferred_points = weighted_point_total(row.get("two_pm"), row.get("three_pm"), row.get("ftm"))
        if inferred_points is not None:
            row["pts"] = round_number(inferred_points, 3)

    if first_number(row.get("fg_pct")) is None and first_number(row.get("fgm")) is not None and first_number(row.get("fga")) is not None:
        row["fg_pct"] = round_number(zero_safe_percent(first_number(row.get("fgm")), first_number(row.get("fga"))), 3)
    if first_number(row.get("fg_pct")) is None and first_number(row.get("two_pa")) is not None and first_number(row.get("three_pa")) is not None and two_pct_ratio is not None and three_pct_ratio is not None and total_fga is not None and total_fga > 0:
        derived_fgm = ((first_number(row.get("two_pa")) * two_pct_ratio) + (first_number(row.get("three_pa")) * three_pct_ratio))
        row["fg_pct"] = round_number((derived_fgm / total_fga) * 100.0, 3)
    if first_number(row.get("two_p_pct")) is None and first_number(row.get("two_pm")) is not None and first_number(row.get("two_pa")) is not None:
        row["two_p_pct"] = round_number(zero_safe_percent(first_number(row.get("two_pm")), first_number(row.get("two_pa"))), 3)
    if first_number(row.get("two_p_pct")) is None and first_number(row.get("two_pa")) == 0:
        row["two_p_pct"] = 0
    if first_number(row.get("three_p_pct")) is None and first_number(row.get("three_pm")) is not None and first_number(row.get("three_pa")) is not None:
        row["three_p_pct"] = round_number(zero_safe_percent(first_number(row.get("three_pm")), first_number(row.get("three_pa"))), 3)
    if first_number(row.get("three_p_pct")) is None and first_number(row.get("three_pa")) == 0:
        row["three_p_pct"] = 0
    if first_number(row.get("ft_pct")) is None and first_number(row.get("ftm")) is not None and first_number(row.get("fta")) is not None:
        row["ft_pct"] = round_number(zero_safe_percent(first_number(row.get("ftm")), first_number(row.get("fta"))), 3)
    if first_number(row.get("ft_pct")) is None and first_number(row.get("fta")) == 0:
        row["ft_pct"] = 0
    if first_number(row.get("efg_pct")) is None:
        efg_pct = zero_safe_efg_pct(row.get("fgm"), row.get("three_pm"), row.get("fga"))
        if efg_pct is not None:
            row["efg_pct"] = round_number(efg_pct, 3)
    if first_number(row.get("ts_pct")) is None:
        ts_pct = zero_safe_ts_pct(row.get("pts"), row.get("fga"), row.get("fta"))
        if ts_pct is not None:
            row["ts_pct"] = round_number(ts_pct, 3)


def subtract_numbers(left: float | None, right: float | None) -> float | None:
    if left is None or right is None:
        return None
    return left - right


def add_numbers(left: float | None, right: float | None) -> float | None:
    if left is None and right is None:
        return None
    return (left or 0.0) + (right or 0.0)


def abs_numeric_gap(left: object, right: object) -> float:
    left_value = first_number(left)
    right_value = first_number(right)
    if left_value is None or right_value is None:
        return math.nan
    return abs(left_value - right_value)


def simplify_school_name(value: object) -> str:
    raw = clean_text(value)
    if not raw:
        return ""
    cleaned = raw.replace("&amp;", "&")
    cleaned = re.sub(r"([A-Za-z])-\(([^)]*)\)", r"\1 \2", cleaned)
    cleaned = re.sub(r"-\s+\(", " (", cleaned)
    cleaned = re.sub(r"\(([^)]*)\)", r" \1 ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    for pattern in TEAM_SUFFIX_PATTERNS:
        cleaned = re.sub(pattern, " ", cleaned, flags=re.I).strip()
    for pattern in ACADEMIC_SUFFIX_PATTERNS:
        while re.search(pattern, cleaned, flags=re.I):
            cleaned = re.sub(pattern, " ", cleaned, flags=re.I).strip()
    cleaned = re.sub(r"\bInstitute of Technology\b", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"\bUniversity\b", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"\bInstitutes?\b", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"^(?:college|cc|community college)\s+of\s+", "", cleaned, flags=re.I)
    cleaned = re.sub(r"^of\s+", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s+(?:of|and|&|-)\s*$", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    tokens = cleaned.split()
    while tokens:
        last = normalize_key(tokens[-1]).replace(" ", "")
        if last not in MASCOT_TOKENS:
            break
        tokens.pop()
        while tokens and normalize_key(tokens[-1]).replace(" ", "") in MASCOT_PREFIX_TOKENS:
            tokens.pop()
    return cleanup_team_edge_words(" ".join(tokens)) or cleaned or raw


def cleanup_team_edge_words(value: object) -> str:
    text = clean_text(value).replace("&amp;", "&")
    text = re.sub(r"^\s*(?:of|and|the|at)\s+", "", text, flags=re.I)
    text = re.sub(r"\s+(?:of|and|the|at)\s*$", "", text, flags=re.I)
    text = re.sub(r"^\s*[&-]\s*", "", text)
    text = re.sub(r"\s*[&-]\s*$", "", text)
    return re.sub(r"\s+", " ", text).strip()


def strip_state_tokens(value: object) -> str:
    tokens = normalize_key(value).split()
    return " ".join(token for token in tokens if token not in TEAM_STATE_TOKENS)


def expand_school_key_variants(value: object) -> list[str]:
    base = normalize_key(value)
    if not base:
        return []
    tokens = [token for token in base.split() if token]
    if not tokens:
        return []
    variants = {" ".join(tokens)}
    for index, token in enumerate(tokens):
        replacement = TEAM_STATE_CODE_TO_NAME.get(token)
        if replacement:
            expanded = list(tokens)
            expanded[index] = replacement
            variants.add(" ".join(expanded))
    if tokens[-1] == "st":
        variants.add(" ".join([*tokens[:-1], "state"]))
    return sorted(variant for variant in variants if variant)


def build_school_keys(value: object) -> list[str]:
    raw = clean_text(value)
    if not raw:
        return []
    candidates = {raw, re.sub(r"\([^)]*\)", " ", raw).strip(), simplify_school_name(raw), strip_state_tokens(raw)}
    keys = set()
    for candidate in candidates:
        normalized = normalize_key(candidate)
        if normalized:
            keys.add(normalized)
            for variant in EXPLICIT_SCHOOL_KEY_VARIANTS.get(normalized, []):
                variant_normalized = normalize_key(variant)
                if variant_normalized:
                    keys.add(variant_normalized)
                    keys.update(expand_school_key_variants(variant_normalized))
        keys.update(expand_school_key_variants(candidate))
    return sorted(keys)


def build_fiba_team_keys(*values: object) -> list[str]:
    keys = set()
    for value in values:
        raw = clean_text(value)
        if not raw:
            continue
        normalized = normalize_key(raw)
        if normalized:
            keys.add(normalized)
        upper = raw.upper().strip()
        if re.fullmatch(r"[A-Z]{3}", upper):
            keys.add(normalize_key(FIBA_CODE_MAP.get(upper, upper)))
    return sorted(key for key in keys if key)


def build_nba_team_keys(*values: object) -> list[str]:
    keys = set()
    for value in values:
        raw = clean_text(value)
        if not raw:
            continue
        for piece in re.split(r"[,/|]+", raw):
            part = piece.strip()
            if not part:
                continue
            keys.update(build_school_keys(part))
            upper = part.upper()
            if re.fullmatch(r"[A-Z]{2,3}", upper):
                canonical = NBA_TEAM_CODE_ALIASES.get(upper, upper)
                keys.add(normalize_key(canonical))
    return sorted(key for key in keys if key)


def build_team_keys_with_alias(value: object, dataset_id: str, team_alias_map: dict[str, dict[str, object]]) -> list[str]:
    raw = clean_text(value)
    if dataset_id == "fiba":
        keys = set(build_fiba_team_keys(raw))
    elif dataset_id == "nba":
        keys = set(build_nba_team_keys(raw))
    else:
        keys = set(build_school_keys(raw))
    canonical = canonicalize_team_name(raw, team_alias_map)
    if canonical:
        if dataset_id == "fiba":
            keys.update(build_fiba_team_keys(canonical))
        elif dataset_id == "nba":
            keys.update(build_nba_team_keys(canonical))
        else:
            keys.update(build_school_keys(canonical))
    return sorted(key for key in keys if key)


def canonicalize_team_name(value: object, team_alias_map: dict[str, dict[str, object]]) -> str:
    raw = clean_text(value)
    if not raw:
        return ""
    for key in [normalize_key(raw), *build_school_keys(raw)]:
        record = team_alias_map.get(key)
        if record:
            return record["canonical_team_name"]
    return ""


def build_row_team_keys(dataset_id: str, row: dict[str, object], team_alias_map: dict[str, dict[str, object]] | None) -> list[str]:
    if dataset_id == "fiba":
        values = [
            row.get("team_name"),
            row.get("team_code"),
            row.get("nationality"),
            canonicalize_team_name(row.get("team_name"), team_alias_map or {}) if team_alias_map else "",
        ]
        return sorted(set(build_fiba_team_keys(*values)))
    if dataset_id == "nba":
        team_values = [
            row.get("_team_name"),
            row.get("_team_display"),
            row.get("team_name"),
            row.get("team_full"),
            row.get("team_alias"),
            row.get("team_alias_all"),
        ]
        keys = set(build_nba_team_keys(*team_values))
        if team_alias_map:
            canonical = canonicalize_team_name(row.get("_team_name") or row.get("team_name"), team_alias_map)
            if canonical:
                keys.update(build_nba_team_keys(canonical))
        return sorted(key for key in keys if key)
    team_values = [
        row.get("_team_name"),
        row.get("_team_display"),
        row.get("team_name"),
        row.get("team_full"),
        row.get("team_alias"),
        row.get("team_alias_all"),
    ]
    keys = set()
    for value in team_values:
        keys.update(build_school_keys(value))
    if team_alias_map:
        canonical = canonicalize_team_name(row.get("_team_name") or row.get("team_name"), team_alias_map)
        if canonical:
            keys.update(build_school_keys(canonical))
    return sorted(key for key in keys if key)


def team_match_score(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0
    left_tokens = set(left.split())
    right_tokens = set(right.split())
    if not left_tokens or not right_tokens:
        return 0.0
    overlap = len(left_tokens & right_tokens)
    if not overlap:
        return 0.0
    min_size = min(len(left_tokens), len(right_tokens))
    max_size = max(len(left_tokens), len(right_tokens))
    if overlap == min_size and min_size >= 2:
        return 0.82
    return overlap / max_size


def score_team_key_sets(left_keys: list[str], right_keys: list[str]) -> float:
    best = 0.0
    for left in left_keys:
        for right in right_keys:
            best = max(best, team_match_score(left, right))
    return best


def compare_team_strings(left: object, right: object, team_alias_map: dict[str, dict[str, object]]) -> bool:
    left_keys = build_team_keys_with_alias(left, "d1", team_alias_map)
    right_keys = build_team_keys_with_alias(right, "d1", team_alias_map)
    return score_team_key_sets(left_keys, right_keys) >= 0.82


def register_team_alias(team_alias_map: dict[str, dict[str, object]], team_alias_details: dict[str, dict[str, object]], alias: object, canonical_team_name: str, source: str, level: str, confidence: float) -> None:
    alias_text = clean_text(alias)
    if not alias_text or not canonical_team_name:
        return
    key_candidates = {normalize_key(alias_text), *build_school_keys(alias_text)}
    detail = team_alias_details.setdefault(canonical_team_name, {
        "canonical_team_name": canonical_team_name,
        "levels": set(),
        "aliases": set(),
        "sources": set(),
    })
    detail["levels"].add(level)
    detail["aliases"].add(alias_text)
    detail["sources"].add(source)
    for key in key_candidates:
        if not key:
            continue
        current = team_alias_map.get(key)
        if current and current["canonical_team_name"] != canonical_team_name and current["confidence"] > confidence:
            continue
        team_alias_map[key] = {
            "alias": alias_text,
            "canonical_team_name": canonical_team_name,
            "source": source,
            "level": level,
            "confidence": confidence,
        }


def build_identity_group_key(dataset_id: str, row: dict[str, object]) -> str:
    source_player_id = clean_text(row.get("_source_player_id"))
    if source_player_id:
        return f"{dataset_id}|src|{source_player_id}"
    name_key = normalize_name_key(row.get("_player_name"))
    dob = clean_text(row.get("_dob_iso"))
    height = row.get("_height_in_value")
    rookie_year = row.get("_rookie_year_value")
    draft_pick = row.get("_draft_pick_value")
    season = row.get("_season_start") or 0
    era = season // 8 if season else 0
    if dob:
        return f"{dataset_id}|dob|{name_key}|{dob}|{round_int(height)}|{rookie_year or ''}|{draft_pick or ''}"
    if rookie_year or draft_pick:
        return f"{dataset_id}|rookie|{name_key}|{rookie_year or ''}|{draft_pick or ''}|{round_int(height)}"
    return f"{dataset_id}|era|{name_key}|{round_int(height)}|{era}"


def build_fallback_canonical_id(row: dict[str, object]) -> str:
    name_key = normalize_name_key(row.get("_player_name"))
    dob = clean_text(row.get("_dob_iso"))
    height = round_int(row.get("_height_in_value"))
    rookie_year = row.get("_rookie_year_value")
    draft_pick = row.get("_draft_pick_value")
    dataset_id = row.get("_dataset_id")
    season = row.get("_season_start") or 0
    era = season // 8 if season else 0
    source_player_id = clean_text(row.get("_source_player_id"))
    if source_player_id:
        return f"fallback_src_{dataset_id}_{source_player_id}"
    if dob:
        return f"fallback_dob_{name_key}_{dob}_{height}"
    if rookie_year or draft_pick:
        return f"fallback_rookie_{name_key}_{rookie_year or ''}_{draft_pick or ''}_{height}"
    return f"fallback_era_{dataset_id}_{name_key}_{height}_{era}"


def identity_row_score(row: dict[str, object]) -> float:
    score = 0.0
    if row.get("_dob_iso"):
        score += 60
    if row.get("_height_in_value") is not None:
        score += 25
    if row.get("_draft_pick_value") is not None:
        score += 20
    if row.get("_source_player_id"):
        score += 15
    score += first_number(row.get("min"), row.get("mp"), row.get("gp"), 0) or 0
    return score


def row_identity_key(row: dict[str, object]) -> str:
    return f"{row.get('_dataset_id')}|{clean_text(row.get('season'))}|{normalize_key(row.get('_team_name'))}|{normalize_name_key(row.get('_player_name'))}"


def runtime_key(dataset_id: str, season: object, team: object, player: object, competition_key: object = "") -> str:
    if dataset_id == "fiba":
        return f"fiba|{clean_text(season)}|{clean_text(competition_key)}|{normalize_key(team)}|{normalize_name_key(player)}"
    return f"{dataset_id}|{clean_text(season)}|{normalize_key(team)}|{normalize_name_key(player)}"


def fill_per_game_and_per40(row: dict[str, object]) -> None:
    gp = first_number(row.get("gp"))
    minutes = first_number(row.get("min"))
    mpg = first_number(row.get("mpg"))
    if (gp is None or gp <= 0) and minutes is not None and mpg is not None and mpg > 0:
        gp = round_number(minutes / mpg, 3)
        row["gp"] = gp
    if (minutes is None or minutes <= 0) and gp is not None and gp > 0 and mpg is not None and mpg > 0:
        minutes = round_number(gp * mpg, 3)
        row["min"] = minutes
    if first_number(row.get("mpg")) is None and minutes is not None and gp and gp > 0:
        row["mpg"] = round_number(minutes / gp, 3)
    row["pts_pg"] = first_number(row.get("pts_pg"), divide_numbers(row.get("pts"), gp))
    row["trb_pg"] = first_number(row.get("trb_pg"), divide_numbers(row.get("trb"), gp))
    row["ast_pg"] = first_number(row.get("ast_pg"), divide_numbers(row.get("ast"), gp))
    row["stl_pg"] = first_number(row.get("stl_pg"), divide_numbers(row.get("stl"), gp))
    row["blk_pg"] = first_number(row.get("blk_pg"), divide_numbers(row.get("blk"), gp))
    row["tov_pg"] = first_number(row.get("tov_pg"), divide_numbers(row.get("tov"), gp))
    fill_per40_only(row)


def fill_per40_only(row: dict[str, object]) -> None:
    minutes = first_number(row.get("min"))
    row["pts_per40"] = first_number(row.get("pts_per40"), per40_value(row.get("pts"), minutes))
    row["trb_per40"] = first_number(row.get("trb_per40"), per40_value(row.get("trb"), minutes))
    row["ast_per40"] = first_number(row.get("ast_per40"), per40_value(row.get("ast"), minutes))
    row["stl_per40"] = first_number(row.get("stl_per40"), per40_value(row.get("stl"), minutes))
    row["blk_per40"] = first_number(row.get("blk_per40"), per40_value(row.get("blk"), minutes))


def per40_value(total: object, minutes: object) -> float | None:
    total_value = first_number(total)
    minute_value = first_number(minutes)
    if total_value is None or minute_value is None or minute_value <= 0:
        return None
    return round((total_value / minute_value) * 40.0, 3)


def divide_numbers(total: object, count: object) -> float | None:
    total_value = first_number(total)
    count_value = first_number(count)
    if total_value is None or count_value is None or count_value <= 0:
        return None
    return round(total_value / count_value, 3)


def round_int(value: object) -> int | str:
    numeric = first_number(value)
    return int(round(numeric)) if numeric is not None else ""


def pick_preferred_name(current: object, candidate: object) -> str:
    current_text = clean_text(current)
    candidate_text = clean_text(candidate)
    if len(candidate_text) > len(current_text):
        return candidate_text
    return current_text or candidate_text


def player_career_source_key(row: dict[str, object]) -> str:
    return "|".join([
        clean_text(row.get("canonical_player_id")),
        clean_text(row.get("season")),
        normalize_key(row.get("team_name")),
        normalize_name_key(row.get("player_name")),
    ])


def derive_realgm_competition_level(source_name: str, team_name: str) -> str:
    if source_name == "realgm_international":
        return "International"
    if source_name == "realgm_gleague":
        return "G League"
    if source_name == "realgm_nba":
        return "NBA"
    team_key = normalize_key(team_name)
    if "cc" in team_key or "community college" in team_key or "junior college" in team_key:
        return "JUCO"
    return "College"


def profile_level_sort_key(value: str) -> tuple[int, str]:
    order = {
        "Grassroots": 0,
        "JUCO": 1,
        "D2": 2,
        "NAIA": 3,
        "D1": 4,
        "College": 5,
        "FIBA": 6,
        "International": 7,
        "G League": 8,
        "Professional": 9,
        "NBA": 10,
    }
    return (order.get(value, 99), value)


if __name__ == "__main__":
    main()
