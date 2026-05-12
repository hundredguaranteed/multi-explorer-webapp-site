import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MASTER_PATH = path.resolve(ROOT, "..", "Combine Measurements - Mastersheet.csv");
const OUT_PATH = path.join(ROOT, "data", "vendor", "combine_all_seasons.js");
const GLOBAL_NAME = "COMBINE_ALL_CSV";
const OFFICIAL_COMBINE_FIRST_YEAR = 2000;
const OFFICIAL_COMBINE_LAST_YEAR = Math.max(2026, new Date().getFullYear());
const OFFICIAL_REQUEST_TIMEOUT_MS = 30000;
const OFFICIAL_FETCH_ATTEMPTS = 3;
const OFFICIAL_FETCH_CONCURRENCY = 1;
const UNSPECIFIED_EVENT = "Unspecified";

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
  "season", "draft_year", "draft_pick", "height_wo_shoes", "weight_lb", "weight_kg", "bmi", "standing_vert", "max_vert",
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
const MANUAL_POSITION_OVERRIDES = new Map([
  ["ej onu", "F"],
  ["tony parker", "C"],
]);

const OUTPUT_COLUMNS = [
  "season", "event", "player_name", "pos", "draft_year", "draft_pick", "height_wo_shoes", "weight_lb", "weight_kg", "bmi",
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

function formatSeasonYear(year) {
  const nextYear = String((Number(year) + 1) % 100).padStart(2, "0");
  return `${year}-${nextYear}`;
}

function normalizeNumber(value) {
  const number = toNumber(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePos(value) {
  const text = String(value || "").trim().toUpperCase();
  if (!text) return "";
  if (/^(PG|G|SG|G\/F|SF|F|PF|C)$/.test(text)) return text;
  if (/^(PG|SG|SF|PF|C)(-(PG|SG|SF|PF|C))+$/.test(text)) {
    const parts = new Set(text.split("-"));
    const hasGuard = parts.has("PG") || parts.has("SG");
    const hasForward = parts.has("SF") || parts.has("PF");
    const hasCenter = parts.has("C");
    if (hasGuard && hasForward) return "G/F";
    if (hasForward && hasCenter) return "F/C";
    if (hasGuard) return "G";
    if (hasForward) return "F";
    if (hasCenter) return "C";
  }
  if (text.includes("CENTER")) return "C";
  if (text.includes("FORWARD") && text.includes("GUARD")) return "G/F";
  if (text.includes("FORWARD")) return "F";
  if (text.includes("GUARD")) return "G";
  return text;
}

function runWindowScript(filePath, window) {
  vm.runInNewContext(fs.readFileSync(filePath, "utf8"), { window }, { timeout: 60000 });
}

function loadPlayerCareerYearManifest() {
  const manifestPath = path.join(ROOT, "data", "vendor", "player_career_year_manifest.js");
  if (!fs.existsSync(manifestPath)) return null;
  const window = {};
  runWindowScript(manifestPath, window);
  return window.PLAYER_CAREER_YEAR_MANIFEST || null;
}

function loadPlayerCareerYearCsv(season, manifest) {
  const storeName = "PLAYER_CAREER_YEAR_CSV_CHUNKS";
  const chunkFile = path.join(ROOT, "data", "vendor", "player_career_year_chunks", `${season}.js`);
  if (!fs.existsSync(chunkFile)) return "";
  const window = {};
  runWindowScript(chunkFile, window);
  const parts = manifest?.multipartYearChunks?.[String(season)] || [];
  for (const part of parts) {
    const partFile = path.join(ROOT, "data", "vendor", "player_career_year_chunk_parts", `${part}.js`);
    if (fs.existsSync(partFile)) runWindowScript(partFile, window);
  }
  return window[storeName]?.[String(season)] || "";
}

function buildCareerPositionLookup(seasons) {
  const manifest = loadPlayerCareerYearManifest();
  if (!manifest) return new Map();
  const lookup = new Map();
  for (const season of seasons) {
    const csv = loadPlayerCareerYearCsv(season, manifest);
    if (!csv) continue;
    const rows = parseCsv(csv);
    const header = rows[0] || [];
    const index = Object.fromEntries(header.map((column, idx) => [column, idx]));
    const needed = ["player_name", "season", "pos", "competition_level", "source_dataset", "height_in", "weight_lb", "min", "gp"];
    if (needed.some((column) => index[column] === undefined)) continue;
    for (const cells of rows.slice(1)) {
      const nameKey = normalizeName(cells[index.player_name]);
      const pos = normalizePos(cells[index.pos]);
      if (!nameKey || !pos) continue;
      if (!lookup.has(nameKey)) lookup.set(nameKey, []);
      lookup.get(nameKey).push({
        season: normalizeNumber(cells[index.season]),
        pos,
        level: String(cells[index.competition_level] || cells[index.source_dataset] || ""),
        height: normalizeNumber(cells[index.height_in]),
        weight: normalizeNumber(cells[index.weight_lb]),
        minutes: normalizeNumber(cells[index.min]) || 0,
        gp: normalizeNumber(cells[index.gp]) || 0,
      });
    }
  }
  return lookup;
}

function levelPositionScore(level) {
  const text = String(level || "").toLowerCase();
  if (text.includes("nba")) return 7;
  if (text.includes("d1") || text.includes("college")) return 6;
  if (text.includes("g league")) return 5;
  if (text.includes("international") || text.includes("fiba")) return 4;
  if (text.includes("naia") || text.includes("d2") || text.includes("juco")) return 3;
  return 1;
}

function pickCareerPosition(record, lookup) {
  const manual = MANUAL_POSITION_OVERRIDES.get(normalizeName(record.player_name));
  if (manual) return manual;
  const candidates = lookup.get(normalizeName(record.player_name)) || [];
  if (!candidates.length) return "";
  const season = normalizeNumber(record.season);
  const height = normalizeNumber(record.height_wo_shoes);
  const weight = normalizeNumber(record.weight_lb);
  let best = null;
  for (const candidate of candidates) {
    const seasonDiff = Number.isFinite(season) && Number.isFinite(candidate.season)
      ? Math.abs(candidate.season - season)
      : 4;
    if (seasonDiff > 3) continue;
    if (height && candidate.height && Math.abs(height - candidate.height) > 5) continue;
    if (weight && candidate.weight && Math.abs(weight - candidate.weight) > 70) continue;
    let score = (4 - seasonDiff) * 20 + levelPositionScore(candidate.level) * 4;
    if (height && candidate.height) score += Math.max(0, 8 - Math.abs(height - candidate.height) * 2);
    if (weight && candidate.weight) score += Math.max(0, 6 - Math.abs(weight - candidate.weight) / 8);
    score += Math.min(8, Math.log10((candidate.minutes || 0) + 1) * 2);
    score += Math.min(3, (candidate.gp || 0) / 20);
    if (!best || score > best.score) best = { ...candidate, score };
  }
  return best?.pos || "";
}

function fillMissingPositions(records) {
  const seasons = Array.from(new Set(records.map((record) => String(record.season || "").trim()).filter(Boolean)));
  const lookup = buildCareerPositionLookup(seasons);
  let filled = 0;
  for (const record of records) {
    if (normalizePos(record.pos)) continue;
    const pos = pickCareerPosition(record, lookup);
    if (!pos) continue;
    record.pos = pos;
    filled += 1;
  }
  return filled;
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
      if (!record.event) record.event = UNSPECIFIED_EVENT;
      for (const [field, index] of Object.entries(MASTER_PCT_INDEX)) {
        const value = toNumber(cells[index]);
        if (value !== null) record[`${field}_master_pctile`] = round(value, 1);
      }
      record.source = "mastersheet";
      return record;
    })
    .filter(Boolean);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, options = {}, attempts = OFFICIAL_FETCH_ATTEMPTS, timeoutMs = OFFICIAL_REQUEST_TIMEOUT_MS) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(750 * attempt);
    }
  }
  throw lastError;
}

async function fetchResultSet(endpoint, params, options = {}) {
  const query = new URLSearchParams({ LeagueID: "00", ...params });
  const payload = await fetchJsonWithRetry(`https://stats.nba.com/stats/${endpoint}?${query}`, {
    headers: REQUEST_HEADERS,
  }, options.attempts || OFFICIAL_FETCH_ATTEMPTS, options.timeoutMs || OFFICIAL_REQUEST_TIMEOUT_MS);
  const resultSet = payload?.resultSets?.[0] || payload?.resultSet;
  if (!resultSet?.headers || !Array.isArray(resultSet?.rowSet)) throw new Error(`Unexpected ${endpoint} response`);
  return resultSet.rowSet.map((cells) => Object.fromEntries(resultSet.headers.map((header, index) => [header, cells[index]])));
}

async function fetchOfficialRecordsForYear(year) {
  const seasonYear = formatSeasonYear(year);
  const anthroRows = await fetchResultSet("draftcombineplayeranthro", { SeasonYear: seasonYear });
  const drillRows = await fetchResultSet("draftcombinedrillresults", { SeasonYear: seasonYear });
  const byId = new Map();
  for (const row of anthroRows) {
    const id = String(row.PLAYER_ID || row.TEMP_PLAYER_ID || "").trim();
    if (!id) continue;
    const handLength = toNumber(row.HAND_LENGTH);
    const handWidth = toNumber(row.HAND_WIDTH);
    byId.set(id, {
      season: String(year),
      event: "NBA Combine",
      player_name: String(row.PLAYER_NAME || "").trim(),
      pos: normalizePos(row.POSITION),
      nba_player_id: id,
      height_wo_shoes: round(toNumber(row.HEIGHT_WO_SHOES), 3),
      weight_lb: round(toNumber(row.WEIGHT), 3),
      wingspan: round(toNumber(row.WINGSPAN), 3),
      standing_reach: round(toNumber(row.STANDING_REACH), 3),
      body_fat_pct: round(toNumber(row.BODY_FAT_PCT), 3),
      hand_length: round(handLength, 3),
      hand_width: round(handWidth, 3),
      hand_area: Number.isFinite(handLength) && Number.isFinite(handWidth) ? round(handLength * handWidth, 3) : "",
      source: `nba_stats_${year}`,
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
      shuttle: round(toNumber(row.MODIFIED_LANE_AGILITY_TIME), 3),
      sprint: round(toNumber(row.THREE_QUARTER_SPRINT), 3),
      bench_press: round(toNumber(row.BENCH_PRESS), 3),
    });
  }
  return Array.from(byId.values()).filter((record) => record.player_name);
}

async function fetchOfficialCombineRecords() {
  const records = [];
  let pendingYears = [];
  for (let year = OFFICIAL_COMBINE_FIRST_YEAR; year <= OFFICIAL_COMBINE_LAST_YEAR; year += 1) pendingYears.push(year);
  let failures = [];
  for (let pass = 1; pass <= 2 && pendingYears.length; pass += 1) {
    const results = await mapWithConcurrency(pendingYears, OFFICIAL_FETCH_CONCURRENCY, async (year) => {
      try {
        return { year, records: await fetchOfficialRecordsForYear(year) };
      } catch (error) {
        return { year, error };
      }
    });
    failures = results
      .filter((result) => result.error)
      .map((result) => ({ year: result.year, message: result.error?.message || String(result.error) }));
    results.forEach((result) => {
      if (Array.isArray(result.records)) records.push(...result.records);
    });
    pendingYears = failures.map((failure) => failure.year);
    if (pendingYears.length && pass === 1) await wait(2000);
  }
  if (failures.length) {
    console.warn(`Official combine fetch failures:\n${failures.map((failure) => `${failure.year}: ${failure.message}`).join("\n")}`);
  }
  return records;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchDraftHistoryRecords() {
  return fetchResultSet("drafthistory", {}, { attempts: 4, timeoutMs: 90000 });
}

function normalizeDraftRecord(row) {
  const draftYear = normalizeNumber(row.SEASON);
  const draftPick = normalizeNumber(row.OVERALL_PICK);
  if (!Number.isFinite(draftYear) || !Number.isFinite(draftPick)) return null;
  return {
    player_id: String(row.PERSON_ID || "").trim(),
    player_name: String(row.PLAYER_NAME || "").trim(),
    draft_year: draftYear,
    draft_pick: draftPick,
  };
}

function buildDraftLookup(rows) {
  const byId = new Map();
  const byName = new Map();
  rows.map(normalizeDraftRecord).filter(Boolean).forEach((record) => {
    if (record.player_id) byId.set(record.player_id, record);
    const nameKey = normalizeName(record.player_name);
    if (!nameKey) return;
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push(record);
  });
  byName.forEach((records) => records.sort((left, right) => left.draft_year - right.draft_year || left.draft_pick - right.draft_pick));
  return { byId, byName };
}

function isPlausibleDraftMatch(record, draftRecord) {
  if (!draftRecord) return false;
  const season = normalizeNumber(record.season);
  if (!Number.isFinite(season)) return true;
  const draftYear = normalizeNumber(draftRecord.draft_year);
  if (!Number.isFinite(draftYear)) return false;
  return draftYear >= season && draftYear <= season + 5;
}

function findDraftRecord(record, lookup) {
  const id = String(record.nba_player_id || "").trim();
  const byId = id ? lookup.byId.get(id) : null;
  if (byId && isPlausibleDraftMatch(record, byId)) return byId;
  const candidates = lookup.byName.get(normalizeName(record.player_name)) || [];
  const plausible = candidates.filter((candidate) => isPlausibleDraftMatch(record, candidate));
  if (!plausible.length) return null;
  const season = normalizeNumber(record.season);
  return plausible
    .map((candidate) => ({
      candidate,
      score: (Number.isFinite(season) ? Math.abs(candidate.draft_year - season) : 0) * 100 + candidate.draft_pick,
    }))
    .sort((left, right) => left.score - right.score)[0]?.candidate || null;
}

function applyDraftHistory(records, draftRows) {
  const lookup = buildDraftLookup(draftRows);
  let matched = 0;
  records.forEach((record) => {
    const draftRecord = findDraftRecord(record, lookup);
    if (!draftRecord) return;
    record.draft_year = round(draftRecord.draft_year, 0);
    record.draft_pick = round(draftRecord.draft_pick, 0);
    matched += 1;
  });
  return matched;
}

function enrichDerived(record) {
  const height = toNumber(record.height_wo_shoes);
  const wingspan = toNumber(record.wingspan);
  const reach = toNumber(record.standing_reach);
  const weight = toNumber(record.weight_lb);
  const standingVert = toNumber(record.standing_vert);
  const maxVert = toNumber(record.max_vert);
  const handLength = toNumber(record.hand_length);
  const handWidth = toNumber(record.hand_width);
  if (height && weight && !record.bmi) record.bmi = round((weight / (height * height)) * 703, 2);
  if (height && wingspan && !record.ws_height) record.ws_height = round(wingspan / height, 4);
  if (reach && wingspan && !record.sr_ws) record.sr_ws = round(reach / wingspan, 4);
  if (height && reach && !record.sr_height) record.sr_height = round(reach / height, 4);
  if (wingspan && reach && !record.defensive_range) record.defensive_range = round(wingspan * reach, 2);
  if (reach && maxVert && !record.max_vert_sr) record.max_vert_sr = round(reach + maxVert, 3);
  if (reach && standingVert && !record.standing_vert_sr) record.standing_vert_sr = round(reach + standingVert, 3);
  if (handLength && handWidth && !record.hand_area) record.hand_area = round(handLength * handWidth, 3);
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
const [officialRecords, draftHistoryRows] = await Promise.all([
  fetchOfficialCombineRecords(),
  fetchDraftHistoryRecords(),
]);
const byKey = new Map();
function completenessScore(record) {
  return NUMERIC_COLUMNS.reduce((score, column) => score + (toNumber(record[column]) !== null ? 1 : 0), 0);
}
function hasRecordValue(value) {
  return value !== "" && value !== null && value !== undefined;
}
function mergeOfficialRecord(existing, official) {
  const merged = { ...(existing || {}) };
  for (const [column, value] of Object.entries(official)) {
    if (hasRecordValue(value) || ["event", "source", "nba_player_id"].includes(column)) {
      merged[column] = value;
    }
  }
  return merged;
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
  byKey.set(key, mergeOfficialRecord(byKey.get(key), record));
}
const records = Array.from(byKey.values());
const positionsFilled = fillMissingPositions(records);
const draftMatched = applyDraftHistory(records, draftHistoryRows);
records.forEach(enrichDerived);
assignComputedPercentiles(records);
records.sort((left, right) => Number(right.season || 0) - Number(left.season || 0) || normalizeName(left.player_name).localeCompare(normalizeName(right.player_name)));

const csvText = toCsv(records, OUTPUT_COLUMNS);
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `window.${GLOBAL_NAME} = ${JSON.stringify(csvText)};\n`, "utf8");
console.log(JSON.stringify({ master: masterRecords.length, official: officialRecords.length, draftHistory: draftHistoryRows.length, draftMatched, positionsFilled, output: records.length, path: OUT_PATH }, null, 2));
