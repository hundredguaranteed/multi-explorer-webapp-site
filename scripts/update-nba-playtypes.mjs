import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NBA_BUNDLE_PATH = path.join(ROOT, "data", "nba_all_seasons.js");
const GLOBAL_NAME = "NBA_ALL_CSV";
const ENDPOINT = "https://stats.nba.com/stats/synergyplaytypes";

const PLAYTYPES = [
  ["iso", "Isolation"],
  ["pnr_bh", "PRBallHandler"],
  ["pnr_roll", "PRRollman"],
  ["post_up", "Postup"],
  ["spot_up", "Spotup"],
  ["off_screen", "OffScreen"],
  ["hand_off", "Handoff"],
  ["cut", "Cut"],
  ["off_reb", "OffRebound"],
  ["transition", "Transition"],
  ["misc", "Misc"],
];

const METRIC_COLUMNS = [
  "percentile",
  "freq",
  "ppp",
  "fg_pct",
  "efg_pct",
  "ft_poss_pct",
  "tov_pct",
  "sf_pct",
  "plus1_pct",
  "score_pct",
  "poss",
  "points",
  "fg_made",
  "fga",
  "fg_miss",
  "poss_pg",
  "points_pg",
  "fga_pg",
  "poss_per40",
  "points_per40",
  "fga_per40",
];

const REQUEST_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://www.nba.com",
  "Referer": "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

function decodeBundle(text) {
  const match = text.match(/=\s*(.+?);\s*$/s);
  if (!match) throw new Error(`Unable to parse ${NBA_BUNDLE_PATH}`);
  const payload = JSON.parse(match[1].trim());
  return Array.isArray(payload) ? payload.join("\n") : String(payload);
}

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
    if (char === "\"") {
      inQuotes = true;
    } else if (char === ",") {
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
  if (!rows.length) return { columns: [], records: [] };
  const columns = rows[0];
  const records = rows.slice(1).filter((cells) => cells.some((cell) => cell !== "")).map((cells) => {
    const record = {};
    columns.forEach((column, index) => {
      record[column] = cells[index] ?? "";
    });
    return record;
  });
  return { columns, records };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function toCsv(records, columns) {
  const lines = [columns.map(csvEscape).join(",")];
  records.forEach((record) => {
    lines.push(columns.map((column) => csvEscape(record[column] ?? "")).join(","));
  });
  return `${lines.join("\n")}\n`;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function roundValue(value, digits = 3) {
  if (!Number.isFinite(value)) return "";
  const scale = 10 ** digits;
  const rounded = Math.round(value * scale) / scale;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function setNumber(record, column, value, digits = 3) {
  if (!Number.isFinite(value)) return;
  record[column] = roundValue(value, digits);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function seasonYearFromEndYear(endYear) {
  return `${endYear - 1}-${String(endYear).slice(-2)}`;
}

async function fetchPlaytype(seasonYear, playtype) {
  const params = new URLSearchParams({
    LeagueID: "00",
    PerMode: "Totals",
    PlayType: playtype,
    PlayerOrTeam: "P",
    SeasonType: "Regular Season",
    SeasonYear: seasonYear,
    TypeGrouping: "offensive",
  });
  const url = `${ENDPOINT}?${params}`;
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: REQUEST_HEADERS,
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const resultSet = payload?.resultSets?.[0];
      if (!resultSet?.headers || !Array.isArray(resultSet?.rowSet)) {
        throw new Error("Unexpected NBA stats response shape");
      }
      return resultSet.rowSet.map((cells) => Object.fromEntries(resultSet.headers.map((header, index) => [header, cells[index]])));
    } catch (error) {
      lastError = error;
      await delay(1000 * attempt);
    }
  }
  throw lastError;
}

function buildIndexes(records) {
  const byPlayerTeam = new Map();
  const byPlayer = new Map();
  records.forEach((record) => {
    const season = String(record.season || "").trim();
    const playerId = String(record.player_id || "").trim();
    const teamId = String(record.team_id || "").trim();
    if (!season || !playerId) return;
    if (teamId) byPlayerTeam.set(`${season}|${playerId}|${teamId}`, record);
    const playerKey = `${season}|${playerId}`;
    const bucket = byPlayer.get(playerKey) || [];
    bucket.push(record);
    byPlayer.set(playerKey, bucket);
  });
  return { byPlayerTeam, byPlayer };
}

function applyPlaytypeRow(target, prefix, source) {
  const gp = toNumber(target.gp);
  const minutes = toNumber(target.mp);
  const poss = toNumber(source.POSS);
  const points = toNumber(source.PTS);
  const fga = toNumber(source.FGA);
  setNumber(target, `${prefix}_percentile`, toNumber(source.PERCENTILE), 3);
  setNumber(target, `${prefix}_freq`, toNumber(source.POSS_PCT), 3);
  setNumber(target, `${prefix}_ppp`, toNumber(source.PPP), 3);
  setNumber(target, `${prefix}_fg_pct`, toNumber(source.FG_PCT), 3);
  setNumber(target, `${prefix}_efg_pct`, toNumber(source.EFG_PCT), 3);
  setNumber(target, `${prefix}_ft_poss_pct`, toNumber(source.FT_POSS_PCT), 3);
  setNumber(target, `${prefix}_tov_pct`, toNumber(source.TOV_POSS_PCT), 3);
  setNumber(target, `${prefix}_sf_pct`, toNumber(source.SF_POSS_PCT), 3);
  setNumber(target, `${prefix}_plus1_pct`, toNumber(source.PLUSONE_POSS_PCT), 3);
  setNumber(target, `${prefix}_score_pct`, toNumber(source.SCORE_POSS_PCT), 3);
  setNumber(target, `${prefix}_poss`, poss, 0);
  setNumber(target, `${prefix}_points`, points, 0);
  setNumber(target, `${prefix}_fg_made`, toNumber(source.FGM), 0);
  setNumber(target, `${prefix}_fga`, fga, 0);
  setNumber(target, `${prefix}_fg_miss`, toNumber(source.FGMX), 0);
  if (gp && gp > 0) {
    setNumber(target, `${prefix}_poss_pg`, poss / gp, 3);
    setNumber(target, `${prefix}_points_pg`, points / gp, 3);
    setNumber(target, `${prefix}_fga_pg`, fga / gp, 3);
  }
  if (minutes && minutes > 0) {
    setNumber(target, `${prefix}_poss_per40`, (poss / minutes) * 40, 3);
    setNumber(target, `${prefix}_points_per40`, (points / minutes) * 40, 3);
    setNumber(target, `${prefix}_fga_per40`, (fga / minutes) * 40, 3);
  }
}

const csvText = decodeBundle(fs.readFileSync(NBA_BUNDLE_PATH, "utf8"));
const { columns, records } = parseCsv(csvText);
const allPlaytypeColumns = PLAYTYPES.flatMap(([prefix]) => METRIC_COLUMNS.map((metric) => `${prefix}_${metric}`));
allPlaytypeColumns.forEach((column) => {
  if (!columns.includes(column)) columns.push(column);
});

const seasonEndYears = [...new Set(records.map((record) => Number(record.season)).filter((year) => Number.isInteger(year) && year >= 2016))]
  .sort((left, right) => left - right);
const indexes = buildIndexes(records);
const summary = [];
let applied = 0;
let unmatched = 0;

for (const endYear of seasonEndYears) {
  const seasonYear = seasonYearFromEndYear(endYear);
  for (const [prefix, playtype] of PLAYTYPES) {
    const rows = await fetchPlaytype(seasonYear, playtype);
    let matched = 0;
    rows.forEach((source) => {
      const playerId = String(source.PLAYER_ID || "").trim();
      const teamId = String(source.TEAM_ID || "").trim();
      let target = indexes.byPlayerTeam.get(`${endYear}|${playerId}|${teamId}`);
      if (!target) {
        const bucket = indexes.byPlayer.get(`${endYear}|${playerId}`) || [];
        if (bucket.length === 1) target = bucket[0];
      }
      if (!target) {
        unmatched += 1;
        return;
      }
      applyPlaytypeRow(target, prefix, source);
      matched += 1;
      applied += 1;
    });
    summary.push({ season: endYear, playtype, rows: rows.length, matched });
    console.log(`${endYear} ${playtype}: matched ${matched}/${rows.length}`);
    await delay(150);
  }
}

const outputCsv = toCsv(records, columns);
fs.writeFileSync(NBA_BUNDLE_PATH, `window.${GLOBAL_NAME} = ${JSON.stringify(outputCsv)};\n`, "utf8");
console.log(JSON.stringify({ seasons: seasonEndYears.length, endpoints: summary.length, applied, unmatched }, null, 2));
