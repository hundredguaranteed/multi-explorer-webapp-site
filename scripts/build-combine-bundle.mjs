import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MASTER_PATH = path.resolve(ROOT, "..", "Combine Measurements - Mastersheet.csv");
const OUT_PATH = path.join(ROOT, "data", "vendor", "combine_all_seasons.js");
const GLOBAL_NAME = "COMBINE_ALL_CSV";
const NBA_SEASON_YEAR = "2025-26";

const REQUEST_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://www.nba.com",
  "Referer": "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

const RAW_INDEX = {
  event: 0,
  season: 1,
  player_name: 2,
  pos: 3,
  height_wo_shoes: 4,
  weight_lb: 5,
  weight_kg: 6,
  bmi: 7,
  standing_vert: 8,
  max_vert_sr: 9,
  wingspan: 10,
  ws_height: 11,
  standing_reach: 12,
  sr_ws: 13,
  sr_height: 14,
  defensive_range: 15,
  hand_length: 16,
  hand_width: 17,
  hand_area: 18,
  max_vert: 19,
  avg_vert: 20,
  standing_vert_sr: 21,
  avg_vert_sr: 22,
  height_adj_max_vert_sr: 23,
  sprint: 24,
  lane_agility: 25,
  shuttle: 26,
  longitudinal_area: 27,
  mv_takeoff_force: 28,
  standing_vert_takeoff_force: 29,
  sprint_force: 30,
  takeoff_velocity_residual: 31,
  max_vert_takeoff_velocity: 32,
  standing_vert_takeoff_velocity: 33,
  sprint_acceleration: 34,
  max_vert_sprint_sq: 35,
  max_vert_standing_vert_residual: 72,
};

const MASTER_PCT_INDEX = {
  height_wo_shoes: 39,
  weight_lb: 40,
  weight_kg: 41,
  bmi: 42,
  wingspan: 43,
  ws_height: 44,
  standing_reach: 45,
  sr_height: 46,
  defensive_range: 47,
  hand_length: 48,
  hand_width: 49,
  hand_area: 50,
  standing_vert: 51,
  max_vert: 52,
  avg_vert: 53,
  standing_vert_sr: 54,
  max_vert_sr: 55,
  avg_vert_sr: 56,
  height_adj_max_vert_sr: 57,
  sprint: 58,
  longitudinal_area: 59,
  mv_takeoff_force: 60,
  standing_vert_takeoff_force: 61,
  sprint_force: 62,
  takeoff_velocity_residual: 63,
  standing_vert_takeoff_velocity: 64,
  max_vert_takeoff_velocity: 65,
  sprint_acceleration: 66,
  lane_agility: 67,
  shuttle: 68,
  max_vert_sprint_sq: 69,
};

const NUMERIC_COLUMNS = [
  "season", "height_wo_shoes", "weight_lb", "weight_kg", "bmi", "standing_vert", "max_vert",
  "avg_vert", "max_vert_sr", "standing_vert_sr", "avg_vert_sr", "wingspan", "ws_height",
  "standing_reach", "sr_ws", "sr_height", "defensive_range", "hand_length", "hand_width",
  "hand_area", "body_fat_pct", "sprint", "lane_agility", "modified_lane_agility", "shuttle",
  "bench_press", "height_adj_max_vert_sr", "longitudinal_area", "mv_takeoff_force",
  "standing_vert_takeoff_force", "sprint_force", "takeoff_velocity_residual",
  "max_vert_takeoff_velocity", "standing_vert_takeoff_velocity", "sprint_acceleration",
  "max_vert_sprint_sq", "max_vert_standing_vert_residual",
];

const PERCENTILE_FIELDS = [
  "height_wo_shoes", "weight_lb", "bmi", "wingspan", "ws_height", "standing_reach",
  "sr_height", "defensive_range", "hand_length", "hand_width", "standing_vert", "max_vert",
  "avg_vert", "sprint", "lane_agility", "modified_lane_agility", "shuttle",
];
const LOWER_IS_BETTER = new Set(["sprint", "lane_agility", "modified_lane_agility", "shuttle"]);

const OUTPUT_COLUMNS = [
  "season", "event", "player_name", "pos", "height_wo_shoes", "weight_lb", "weight_kg", "bmi",
  "wingspan", "ws_height", "standing_reach", "sr_ws", "sr_height", "defensive_range",
  "hand_length", "hand_width", "hand_area", "body_fat_pct", "standing_vert", "max_vert",
  "avg_vert", "standing_vert_sr", "max_vert_sr", "avg_vert_sr", "height_adj_max_vert_sr",
  "sprint", "lane_agility", "modified_lane_agility", "shuttle", "bench_press",
  "longitudinal_area", "mv_takeoff_force", "standing_vert_takeoff_force", "sprint_force",
  "takeoff_velocity_residual", "standing_vert_takeoff_velocity", "max_vert_takeoff_velocity",
  "sprint_acceleration", "max_vert_sprint_sq", "max_vert_standing_vert_residual",
  ...PERCENTILE_FIELDS.flatMap((field) => [
    `${field}_master_pctile`,
    `${field}_overall_pctile`,
    `${field}_year_pctile`,
    `${field}_pos_pctile`,
    `${field}_year_pos_pctile`,
  ]),
  "source",
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === "\"") inQuotes = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function toCsv(records, columns) {
  return [
    columns.map(csvEscape).join(","),
    ...records.map((record) => columns.map((column) => csvEscape(record[column] ?? "")).join(",")),
  ].join("\n") + "\n";
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/,/g, "").trim();
  if (!text || /^#N\/A$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return "";
  const scale = 10 ** digits;
  const rounded = Math.round(value * scale) / scale;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePos(value) {
  const text = String(value || "").trim().toUpperCase();
  if (!text) return "";
  if (/^(PG|G|SG|G\/F|SF|F|PF|C)$/.test(text)) return text;
  if (text.includes("CENTER")) return "C";
  if (text.includes("FORWARD") && text.includes("GUARD")) return "G/F";
  if (text.includes("FORWARD")) return "F";
  if (text.includes("GUARD")) return "G";
  return text;
}

function readMasterRecords() {
  const rows = parseCsv(fs.readFileSync(MASTER_PATH, "utf8"));
  return rows.slice(1)
    .filter((cells) => cells.some((cell) => String(cell || "").trim()))
    .map((cells) => {
      const record = {};
      for (const [column, index] of Object.entries(RAW_INDEX)) {
        if (column === "event" || column === "player_name") {
          record[column] = String(cells[index] || "").trim();
        } else if (column === "pos") {
          record[column] = normalizePos(cells[index]);
        } else {
          const value = toNumber(cells[index]);
          if (value !== null) record[column] = round(value, column === "season" ? 0 : 3);
        }
      }
      if (!record.player_name || !record.season) return null;
      if (!record.event) record.event = "NBA Combine";
      for (const [field, index] of Object.entries(MASTER_PCT_INDEX)) {
        const value = toNumber(cells[index]);
        if (value !== null) record[`${field}_master_pctile`] = round(value, 1);
      }
      record.source = "mastersheet";
      return record;
    })
    .filter(Boolean);
}

async function fetchResultSet(endpoint) {
  const params = new URLSearchParams({ LeagueID: "00", SeasonYear: NBA_SEASON_YEAR });
  const response = await fetch(`https://stats.nba.com/stats/${endpoint}?${params}`, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`${endpoint} HTTP ${response.status}`);
  const payload = await response.json();
  const resultSet = payload?.resultSets?.[0] || payload?.resultSet;
  if (!resultSet?.headers || !Array.isArray(resultSet?.rowSet)) throw new Error(`Unexpected ${endpoint} response`);
  return resultSet.rowSet.map((cells) => Object.fromEntries(resultSet.headers.map((header, index) => [header, cells[index]])));
}

async function fetchOfficial2025Records() {
  const [anthroRows, drillRows] = await Promise.all([
    fetchResultSet("draftcombineplayeranthro"),
    fetchResultSet("draftcombinedrillresults"),
  ]);
  const byId = new Map();
  for (const row of anthroRows) {
    const id = String(row.PLAYER_ID || row.TEMP_PLAYER_ID || "").trim();
    if (!id) continue;
    byId.set(id, {
      season: "2025",
      event: "NBA Combine",
      player_name: String(row.PLAYER_NAME || "").trim(),
      pos: normalizePos(row.POSITION),
      height_wo_shoes: round(toNumber(row.HEIGHT_WO_SHOES), 3),
      weight_lb: round(toNumber(row.WEIGHT), 3),
      wingspan: round(toNumber(row.WINGSPAN), 3),
      standing_reach: round(toNumber(row.STANDING_REACH), 3),
      body_fat_pct: round(toNumber(row.BODY_FAT_PCT), 3),
      hand_length: round(toNumber(row.HAND_LENGTH), 3),
      hand_width: round(toNumber(row.HAND_WIDTH), 3),
      source: "nba_stats_2025",
    });
  }
  for (const row of drillRows) {
    const id = String(row.PLAYER_ID || row.TEMP_PLAYER_ID || "").trim();
    const target = byId.get(id);
    if (!target) continue;
    Object.assign(target, {
      standing_vert: round(toNumber(row.STANDING_VERTICAL_LEAP), 3),
      max_vert: round(toNumber(row.MAX_VERTICAL_LEAP), 3),
      lane_agility: round(toNumber(row.LANE_AGILITY_TIME), 3),
      modified_lane_agility: round(toNumber(row.MODIFIED_LANE_AGILITY_TIME), 3),
      sprint: round(toNumber(row.THREE_QUARTER_SPRINT), 3),
      bench_press: round(toNumber(row.BENCH_PRESS), 3),
    });
  }
  return Array.from(byId.values()).filter((record) => record.player_name);
}

function enrichDerived(record) {
  const height = toNumber(record.height_wo_shoes);
  const wingspan = toNumber(record.wingspan);
  const reach = toNumber(record.standing_reach);
  const weight = toNumber(record.weight_lb);
  const standingVert = toNumber(record.standing_vert);
  const maxVert = toNumber(record.max_vert);
  if (height && weight && !record.bmi) record.bmi = round((weight / (height * height)) * 703, 2);
  if (height && wingspan && !record.ws_height) record.ws_height = round(wingspan / height, 4);
  if (reach && wingspan && !record.sr_ws) record.sr_ws = round(reach / wingspan, 4);
  if (height && reach && !record.sr_height) record.sr_height = round(reach / height, 4);
  if (wingspan && reach && !record.defensive_range) record.defensive_range = round(wingspan * reach, 2);
  if (reach && maxVert && !record.max_vert_sr) record.max_vert_sr = round(reach + maxVert, 3);
  if (reach && standingVert && !record.standing_vert_sr) record.standing_vert_sr = round(reach + standingVert, 3);
}

function percentileFor(value, distribution, lowerIsBetter) {
  if (!Number.isFinite(value) || distribution.length <= 1) return "";
  let betterOrEqual = 0;
  distribution.forEach((other) => {
    if (lowerIsBetter ? other >= value : other <= value) betterOrEqual += 1;
  });
  return round((betterOrEqual / distribution.length) * 100, 1);
}

function assignComputedPercentiles(records) {
  const scopes = {
    overall: () => "all",
    year: (record) => String(record.season || ""),
    pos: (record) => normalizePos(record.pos) || "unknown",
    year_pos: (record) => `${record.season || ""}|${normalizePos(record.pos) || "unknown"}`,
  };
  for (const field of PERCENTILE_FIELDS) {
    for (const [scopeName, scopeKeyFn] of Object.entries(scopes)) {
      const buckets = new Map();
      records.forEach((record) => {
        const value = toNumber(record[field]);
        if (!Number.isFinite(value)) return;
        const key = scopeKeyFn(record);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(value);
      });
      records.forEach((record) => {
        const value = toNumber(record[field]);
        if (!Number.isFinite(value)) return;
        const bucket = buckets.get(scopeKeyFn(record)) || [];
        record[`${field}_${scopeName}_pctile`] = percentileFor(value, bucket, LOWER_IS_BETTER.has(field));
      });
    }
  }
}

const masterRecords = readMasterRecords();
const officialRecords = await fetchOfficial2025Records();
const byKey = new Map();
function completenessScore(record) {
  return NUMERIC_COLUMNS.reduce((score, column) => score + (toNumber(record[column]) !== null ? 1 : 0), 0);
}
function putBestRecord(record) {
  const key = `${record.season}|${normalizeName(record.player_name)}`;
  const existing = byKey.get(key);
  if (!existing || completenessScore(record) > completenessScore(existing)) {
    byKey.set(key, record);
  }
}
for (const record of masterRecords) putBestRecord(record);
for (const record of officialRecords) {
  const key = `${record.season}|${normalizeName(record.player_name)}`;
  byKey.set(key, { ...(byKey.get(key) || {}), ...record });
}
const records = Array.from(byKey.values());
records.forEach(enrichDerived);
assignComputedPercentiles(records);
records.sort((left, right) => Number(right.season || 0) - Number(left.season || 0) || normalizeName(left.player_name).localeCompare(normalizeName(right.player_name)));

const csvText = toCsv(records, OUTPUT_COLUMNS);
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `window.${GLOBAL_NAME} = ${JSON.stringify(csvText)};\n`, "utf8");
console.log(JSON.stringify({ master: masterRecords.length, official2025: officialRecords.length, output: records.length, path: OUT_PATH }, null, 2));
