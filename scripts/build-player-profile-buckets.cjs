const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "vendor", "player_profile_buckets");
const MANIFEST_PATH = path.join(ROOT, "data", "vendor", "player_profile_buckets_manifest.js");
const BUCKET_COUNT = 256;

const PROFILE_COLUMNS = [
  "canonical_player_id",
  "realgm_player_id",
  "source_player_id",
  "player_profile_key",
  "player_name",
  "season",
  "source_dataset",
  "competition_level",
  "team_name",
  "team_full",
  "team_abbrev",
  "league",
  "league_name",
  "competition_label",
  "career_path",
  "profile_levels",
  "realgm_summary_url",
  "dob",
  "birthday",
  "height_in",
  "inches",
  "age",
  "pos",
  "class_year",
  "draft_year",
  "draft_pick",
  "rookie_year",
  "gp",
  "min",
  "mpg",
  "pts",
  "trb",
  "orb",
  "drb",
  "ast",
  "tov",
  "stl",
  "blk",
  "pf",
  "stocks",
  "fgm",
  "fga",
  "two_pm",
  "two_pa",
  "three_pm",
  "three_pa",
  "ftm",
  "fta",
  "pts_pg",
  "trb_pg",
  "orb_pg",
  "drb_pg",
  "ast_pg",
  "stl_pg",
  "blk_pg",
  "tov_pg",
  "pf_pg",
  "stocks_pg",
  "fgm_pg",
  "fga_pg",
  "two_pm_pg",
  "two_pa_pg",
  "three_pm_pg",
  "three_pa_pg",
  "ftm_pg",
  "fta_pg",
  "fg_pct",
  "two_p_pct",
  "three_p_pct",
  "ft_pct",
  "efg_pct",
  "ts_pct",
  "ftr",
  "three_pr",
  "adjoe",
  "adrtg",
  "porpag",
  "dporpag",
  "bpm",
  "per",
  "rgm_per",
  "orb_pct",
  "drb_pct",
  "trb_pct",
  "ast_pct",
  "tov_pct",
  "stl_pct",
  "blk_pct",
  "usg_pct",
  "ast_to",
  "pts_per40",
  "trb_per40",
  "orb_per40",
  "drb_per40",
  "ast_per40",
  "tov_per40",
  "stl_per40",
  "blk_per40",
  "pf_per40",
  "stocks_per40",
  "fgm_per40",
  "fga_per40",
  "two_pm_per40",
  "two_pa_per40",
  "three_pm_per40",
  "three_pa_per40",
  "ftm_per40",
  "fta_per40",
];

const NUMERIC_COLUMNS = new Set([
  "season",
  "draft_year",
  "draft_pick",
  "rookie_year",
  "height_in",
  "inches",
  "weight_lb",
  "age",
  "gp",
  "g",
  "min",
  "mp",
  "mpg",
  "pts",
  "trb",
  "reb",
  "orb",
  "drb",
  "ast",
  "tov",
  "stl",
  "blk",
  "pf",
  "stocks",
  "fgm",
  "fg",
  "fga",
  "two_pm",
  "2pm",
  "fg2m",
  "two_pa",
  "2pa",
  "fg2a",
  "three_pm",
  "3pm",
  "tpm",
  "fg3m",
  "three_pa",
  "3pa",
  "tpa",
  "fg3a",
  "ftm",
  "fta",
  "pts_pg",
  "trb_pg",
  "orb_pg",
  "drb_pg",
  "ast_pg",
  "stl_pg",
  "blk_pg",
  "tov_pg",
  "pf_pg",
  "stocks_pg",
  "fgm_pg",
  "fga_pg",
  "two_pm_pg",
  "two_pa_pg",
  "three_pm_pg",
  "three_pa_pg",
  "ftm_pg",
  "fta_pg",
  "fg_pct",
  "two_p_pct",
  "three_p_pct",
  "ft_pct",
  "efg_pct",
  "ts_pct",
  "ftr",
  "three_pr",
  "rim_made",
  "rim_att",
  "rim_pct",
  "mid_made",
  "mid_att",
  "mid_pct",
  "adjoe",
  "adrtg",
  "porpag",
  "dporpag",
  "bpm",
  "per",
  "rgm_per",
  "orb_pct",
  "drb_pct",
  "trb_pct",
  "ast_pct",
  "tov_pct",
  "stl_pct",
  "blk_pct",
  "usg_pct",
  "ast_to",
  "pts_per40",
  "trb_per40",
  "orb_per40",
  "drb_per40",
  "ast_per40",
  "tov_per40",
  "stl_per40",
  "blk_per40",
  "pf_per40",
  "stocks_per40",
  "fgm_per40",
  "fga_per40",
  "two_pm_per40",
  "two_pa_per40",
  "three_pm_per40",
  "three_pa_per40",
  "ftm_per40",
  "fta_per40",
  "plus_minus",
  "plus_minus_pg",
  "eff",
  "eff_pg",
]);

const STAT_COLUMNS = [
  "gp",
  "g",
  "min",
  "mp",
  "mpg",
  "pts",
  "pts_pg",
  "trb",
  "trb_pg",
  "orb",
  "orb_pg",
  "drb",
  "drb_pg",
  "ast",
  "ast_pg",
  "tov",
  "tov_pg",
  "stl",
  "stl_pg",
  "blk",
  "blk_pg",
  "pf",
  "pf_pg",
  "stocks",
  "stocks_pg",
  "fgm",
  "fgm_pg",
  "fga",
  "fga_pg",
  "two_pm",
  "two_pm_pg",
  "two_pa",
  "two_pa_pg",
  "three_pm",
  "three_pm_pg",
  "three_pa",
  "three_pa_pg",
  "ftm",
  "ftm_pg",
  "fta",
  "fta_pg",
  "fg_pct",
  "two_p_pct",
  "three_p_pct",
  "ft_pct",
  "efg_pct",
  "ts_pct",
  "ast_to",
  "per",
  "bpm",
];

function bucketKey(realgmId) {
  const id = Number(String(realgmId || "").trim());
  if (!Number.isFinite(id) || id <= 0) return "";
  return `r${String(Math.abs(Math.trunc(id)) % BUCKET_COUNT).padStart(3, "0")}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === "\"") {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function hasStatContent(row, headerIndex) {
  return STAT_COLUMNS.some((column) => {
    const index = headerIndex[column];
    if (index == null) return false;
    const raw = row[index];
    if (raw == null || raw === "") return false;
    const value = Number(raw);
    if (!Number.isFinite(value)) return false;
    if (["gp", "g", "min", "mp", "mpg"].includes(column)) return value > 0;
    return Math.abs(value) > 0;
  });
}

function compactValue(column, raw) {
  if (raw == null || raw === "") return null;
  if (NUMERIC_COLUMNS.has(column)) {
    const value = Number(raw);
    return Number.isFinite(value) ? value : raw;
  }
  return raw;
}

function compactRow(row, headerIndex) {
  const values = PROFILE_COLUMNS.map((column) => compactValue(column, row[headerIndex[column]]));
  while (values.length && values[values.length - 1] == null) values.pop();
  return values;
}

function loadYearCsv(year, manifest) {
  global.window = global;
  global.PLAYER_CAREER_YEAR_CSV_CHUNKS = {};
  const parts = manifest?.multipart?.[year];
  const loadedModules = [];
  if (Array.isArray(parts) && parts.length) {
    parts.forEach((part) => {
      const modulePath = path.join(ROOT, "data", "vendor", "player_career_year_chunk_parts", part);
      loadedModules.push(require.resolve(modulePath));
      require(modulePath);
    });
  } else {
    const modulePath = path.join(ROOT, "data", "vendor", "player_career_year_chunks", `${year}.js`);
    loadedModules.push(require.resolve(modulePath));
    require(modulePath);
  }
  const csv = global.PLAYER_CAREER_YEAR_CSV_CHUNKS?.[year] || "";
  loadedModules.forEach((modulePath) => {
    delete require.cache[modulePath];
  });
  delete global.PLAYER_CAREER_YEAR_CSV_CHUNKS;
  return csv;
}

function writeJs(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function main() {
  global.window = global;
  require(path.join(ROOT, "data", "vendor", "player_career_year_manifest.js"));
  const manifest = global.PLAYER_CAREER_YEAR_MANIFEST;
  if (!manifest?.years?.length) throw new Error("Missing Player/Career year manifest");

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const counts = {};
  const files = new Set();
  let scanned = 0;
  let kept = 0;

  manifest.years.forEach((year) => {
    const csv = loadYearCsv(String(year), manifest);
    const parsed = parseCsv(csv);
    if (parsed.length < 2) return;
    const header = parsed[0];
    const headerIndex = Object.fromEntries(header.map((column, index) => [column, index]));
    const yearBuckets = new Map();
    for (let i = 1; i < parsed.length; i += 1) {
      const row = parsed[i];
      scanned += 1;
      const realgmId = row[headerIndex.realgm_player_id];
      const key = bucketKey(realgmId);
      if (!key || !hasStatContent(row, headerIndex)) continue;
      if (!yearBuckets.has(key)) yearBuckets.set(key, []);
      yearBuckets.get(key).push(compactRow(row, headerIndex));
      counts[key] = (counts[key] || 0) + 1;
      kept += 1;
    }
    yearBuckets.forEach((rows, key) => {
      const filePath = path.join(OUT_DIR, `${key}.js`);
      if (!files.has(key)) {
        writeJs(filePath, `window.PLAYER_PROFILE_BUCKETS=window.PLAYER_PROFILE_BUCKETS||{};window.PLAYER_PROFILE_BUCKETS[${JSON.stringify(key)}]=[];\n`);
        files.add(key);
      }
      fs.appendFileSync(filePath, `window.PLAYER_PROFILE_BUCKETS[${JSON.stringify(key)}].push(...${JSON.stringify(rows)});\n`, "utf8");
    });
    console.log(`${year}: scanned ${parsed.length - 1}, kept ${kept}`);
  });

  const outManifest = {
    version: new Date().toISOString(),
    bucketCount: BUCKET_COUNT,
    columns: PROFILE_COLUMNS,
    files: Array.from(files).sort(),
    counts,
    scanned,
    kept,
    pathTemplate: "data/vendor/player_profile_buckets/{bucket}.js",
  };
  writeJs(
    MANIFEST_PATH,
    `window.PLAYER_PROFILE_BUCKET_MANIFEST=${JSON.stringify(outManifest)};\n`,
  );
  console.log(`Wrote ${files.size} buckets. Scanned ${scanned}; kept ${kept}.`);
}

main();
