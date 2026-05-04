import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CHUNK_DIR = path.join(ROOT, "data", "vendor", "player_career_year_chunks");
const OUT_PATH = path.join(ROOT, "data", "vendor", "gleague_all_seasons.js");
const GLOBAL_NAME = "GLEAGUE_ALL_CSV";

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
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function extractCsv(sourceText) {
  const assignment = sourceText.indexOf("window.PLAYER_CAREER_YEAR_CSV_CHUNKS");
  if (assignment < 0) throw new Error("Unable to parse player career year chunk.");
  const keyedAssignment = sourceText.indexOf("\"] =", assignment);
  const equals = keyedAssignment >= 0 ? sourceText.indexOf("=", keyedAssignment) : sourceText.indexOf("=", assignment);
  if (equals < 0) throw new Error("Unable to parse player career year chunk assignment.");
  const start = sourceText.indexOf("\"", equals);
  if (start < 0) throw new Error("Unable to parse player career year chunk string.");
  let escaped = false;
  for (let index = start + 1; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") return JSON.parse(sourceText.slice(start, index + 1));
  }
  throw new Error("Unterminated player career year chunk string.");
}

function isGLeagueRow(record) {
  const level = String(record.competition_level || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const source = String(record.source_dataset || "").toLowerCase();
  const league = String(record.league || record.competition_label || record.league_name || "").toLowerCase();
  return level === "g league" || source.includes("g league") || league.includes("g league");
}

const files = fs.readdirSync(CHUNK_DIR)
  .filter((fileName) => fileName.endsWith(".js"))
  .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

let header = null;
const outputRows = [];
const seen = new Set();

files.forEach((fileName) => {
  const csv = extractCsv(fs.readFileSync(path.join(CHUNK_DIR, fileName), "utf8"));
  const rows = parseCsv(csv);
  if (!rows.length) return;
  const localHeader = rows.shift();
  if (!header) header = localHeader;
  const index = Object.fromEntries(localHeader.map((column, columnIndex) => [column, columnIndex]));
  rows.forEach((row) => {
    const record = Object.fromEntries(localHeader.map((column, columnIndex) => [column, row[columnIndex] ?? ""]));
    if (!isGLeagueRow(record)) return;
    const key = [
      record.canonical_player_id,
      record.realgm_player_id,
      record.player_name,
      record.season,
      record.team_name,
      record.league,
    ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    outputRows.push(header.map((column) => record[column] ?? row[index[column]] ?? ""));
  });
});

if (!header) throw new Error("No player career chunks found.");

const csv = [
  header.map(csvEscape).join(","),
  ...outputRows.map((row) => row.map(csvEscape).join(",")),
].join("\n") + "\n";

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `window.${GLOBAL_NAME} = ${JSON.stringify(csv)};\n`, "utf8");
console.log(`Wrote ${outputRows.length} G League rows.`);
