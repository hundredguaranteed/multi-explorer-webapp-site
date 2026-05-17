import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IN_PATH = path.join(ROOT, "data", "vendor", "combine_all_seasons.js");
const OUT_PATH = path.join(ROOT, "data", "vendor", "combine_measurement_lookup.js");

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

function toNumber(value) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function sourceRank(record) {
  const event = String(record.event || "").toLowerCase();
  if (event.includes("nba combine")) return 5;
  if (event.includes("g league")) return 4;
  if (event.includes("portsmouth")) return 3;
  return 1;
}

function isBetterRecord(next, current) {
  if (!current) return true;
  const nextRank = sourceRank(next);
  const currentRank = sourceRank(current);
  if (nextRank !== currentRank) return nextRank > currentRank;
  const nextCompleteness = [
    "height_wo_shoes", "weight_lb", "wingspan", "standing_reach",
    "standing_vert", "max_vert", "sprint", "lane_agility", "hand_area",
  ]
    .reduce((total, key) => total + (Number.isFinite(next[key]) ? 1 : 0), 0);
  const currentCompleteness = [
    "height_wo_shoes", "weight_lb", "wingspan", "standing_reach",
    "standing_vert", "max_vert", "sprint", "lane_agility", "hand_area",
  ]
    .reduce((total, key) => total + (Number.isFinite(current[key]) ? 1 : 0), 0);
  if (nextCompleteness !== currentCompleteness) return nextCompleteness > currentCompleteness;
  return Number(next.season || 0) > Number(current.season || 0);
}

const source = fs.readFileSync(IN_PATH, "utf8");
const match = source.match(/window\.COMBINE_ALL_CSV\s*=\s*("(?:\\.|[^"])*")\s*;/s);
if (!match) throw new Error("Unable to read COMBINE_ALL_CSV.");

const rows = parseCsv(JSON.parse(match[1]));
const header = rows.shift() || [];
const index = Object.fromEntries(header.map((column, columnIndex) => [column, columnIndex]));
const byName = {};

rows.forEach((row) => {
  const playerName = row[index.player_name] || "";
  const key = normalizeName(playerName);
  if (!key) return;
  const record = {
    player_name: playerName,
    season: toNumber(row[index.season]),
    event: row[index.event] || "",
    source: row[index.source] || "",
    pos: row[index.pos] || "",
    draft_year: toNumber(row[index.draft_year]),
    draft_pick: toNumber(row[index.draft_pick]),
    height_wo_shoes: toNumber(row[index.height_wo_shoes]),
    weight_lb: toNumber(row[index.weight_lb]),
    bmi: toNumber(row[index.bmi]),
    wingspan: toNumber(row[index.wingspan]),
    ws_diff: toNumber(row[index.ws_diff]),
    ws_height: toNumber(row[index.ws_height]),
    standing_reach: toNumber(row[index.standing_reach]),
    sr_height: toNumber(row[index.sr_height]),
    sr_ws: toNumber(row[index.sr_ws]),
    defensive_range: toNumber(row[index.defensive_range]),
    hand_length: toNumber(row[index.hand_length]),
    hand_width: toNumber(row[index.hand_width]),
    hand_area: toNumber(row[index.hand_area]),
    body_fat_pct: toNumber(row[index.body_fat_pct]),
    standing_vert: toNumber(row[index.standing_vert]),
    max_vert: toNumber(row[index.max_vert]),
    avg_vert: toNumber(row[index.avg_vert]),
    standing_vert_sr: toNumber(row[index.standing_vert_sr]),
    max_vert_sr: toNumber(row[index.max_vert_sr]),
    avg_vert_sr: toNumber(row[index.avg_vert_sr]),
    height_adj_max_vert_sr: toNumber(row[index.height_adj_max_vert_sr]),
    sprint: toNumber(row[index.sprint]),
    lane_agility: toNumber(row[index.lane_agility]),
    modified_lane_agility: toNumber(row[index.modified_lane_agility]),
    shuttle: toNumber(row[index.shuttle]),
    bench_press: toNumber(row[index.bench_press]),
  };
  if (isBetterRecord(record, byName[key])) byName[key] = record;
});

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `window.COMBINE_MEASUREMENT_LOOKUP = ${JSON.stringify({ byName })};\n`, "utf8");
console.log(`Wrote ${Object.keys(byName).length} combine measurement records.`);
