import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "data", "vendor", "status_realgm_index.js");
const D1_YEAR_DIR = path.join(ROOT, "data", "vendor", "d1_year_chunks");
const NAIA_MANIFEST_PATH = path.join(ROOT, "data", "vendor", "naia_all_seasons_manifest.js");
const NAIA_PARTS_DIR = path.join(ROOT, "data", "vendor", "naia_all_seasons_parts");

const DATASET_SOURCES = {
  d1: {
    files: () => fs.readdirSync(D1_YEAR_DIR)
      .filter((name) => name.endsWith(".js"))
      .sort((left, right) => left.localeCompare(right, "en", { numeric: true }))
      .map((name) => path.join(D1_YEAR_DIR, name)),
    type: "d1-year",
  },
  d2: { files: () => [path.join(ROOT, "data", "d2_all_seasons.js")], type: "bundle" },
  naia: { files: () => [NAIA_MANIFEST_PATH], type: "naia-multipart" },
  juco: { files: () => [path.join(ROOT, "data", "vendor", "juco_all_seasons.js")], type: "bundle" },
  nba: { files: () => [path.join(ROOT, "data", "nba_all_seasons.js")], type: "bundle" },
};

const DATASET_SLOTS = {
  d1: [0, 1],
  d2: [2, 3],
  naia: [4, 5],
  juco: [6, 7],
  nba: [8, 9],
};

function firstFinite(...values) {
  return values.find((value) => Number.isFinite(value));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === "\"") {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char === "\r") continue;
    cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows[0] || [];
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function parseBundlePayload(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(/=\s*(".*"|\[.*\])\s*;\s*$/s);
  if (!match) throw new Error(`Unable to parse bundle: ${filePath}`);
  const payload = JSON.parse(match[1]);
  const csvText = Array.isArray(payload) ? payload.join("\n") : String(payload);
  return parseCsv(csvText);
}

function parseD1YearChunk(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(/D1_YEAR_CSV_CHUNKS\[[^\]]+\]\s*=\s*(".*");\s*$/s);
  if (!match) throw new Error(`Unable to parse D1 year chunk: ${filePath}`);
  return parseCsv(JSON.parse(match[1]));
}

function parseNaiaPartPayload(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(/\+\s*(".*")\s*;\s*$/s);
  if (!match) throw new Error(`Unable to parse NAIA part: ${filePath}`);
  return JSON.parse(match[1]);
}

function parseNaiaMultipart() {
  const manifestText = fs.readFileSync(NAIA_MANIFEST_PATH, "utf8");
  const manifestMatch = manifestText.match(/=\s*(\[[\s\S]*\])\s*;\s*$/);
  if (!manifestMatch) throw new Error(`Unable to parse NAIA manifest: ${NAIA_MANIFEST_PATH}`);
  const partNames = JSON.parse(manifestMatch[1]);
  const csvText = partNames
    .map((partName) => path.join(NAIA_PARTS_DIR, `${String(partName)}.js`))
    .map((filePath) => parseNaiaPartPayload(filePath))
    .join("");
  return parseCsv(csvText);
}

function getStatusIdentityId(row) {
  const realgmId = String(row?.realgm_player_id || "").trim();
  if (realgmId) return realgmId;
  const canonicalId = String(row?.canonical_player_id || "").trim();
  const canonicalMatch = canonicalId.match(/^rgm_(.+)$/i);
  return canonicalMatch ? canonicalMatch[1] : "";
}

function extractLeadingYear(value) {
  const text = String(value || "");
  const match = text.match(/\d{4}/);
  return match ? Number(match[0]) : Number.NaN;
}

function updateMinMax(entry, datasetId, season) {
  const [minSlot, maxSlot] = DATASET_SLOTS[datasetId];
  if (!Number.isFinite(season)) return;
  if (!Number.isFinite(entry[minSlot]) || season < entry[minSlot]) entry[minSlot] = season;
  if (!Number.isFinite(entry[maxSlot]) || season > entry[maxSlot]) entry[maxSlot] = season;
}

function updateCandidateProfile(profile, row) {
  const name = String(row?.player_name || row?.player || "").trim();
  if (name && (!profile.name || name.length > profile.name.length)) profile.name = name;
  const dob = String(row?.dob || "").trim();
  if (dob && !profile.dob) profile.dob = dob;
  const height = firstFinite(Number(row?.height_in), Number(row?.inches), Number.NaN);
  if (Number.isFinite(height)) profile.heights.add(Math.round(height));
}

function main() {
  const players = Object.create(null);
  const candidateProfiles = Object.create(null);
  Object.entries(DATASET_SOURCES).forEach(([datasetId, source]) => {
    source.files().forEach((filePath) => {
      let rows = [];
      if (source.type === "d1-year") rows = parseD1YearChunk(filePath);
      else if (source.type === "naia-multipart") rows = parseNaiaMultipart();
      else rows = parseBundlePayload(filePath);
      rows.forEach((row) => {
        const realgmId = getStatusIdentityId(row);
        const season = extractLeadingYear(row?.season);
        if (!realgmId || !Number.isFinite(season)) return;
        if (!players[realgmId]) players[realgmId] = Array(10).fill(null);
        updateMinMax(players[realgmId], datasetId, season);
        if ((datasetId === "d1" || datasetId === "nba")) {
          if (!candidateProfiles[realgmId]) {
            candidateProfiles[realgmId] = {
              name: "",
              dob: "",
              heights: new Set(),
            };
          }
          updateCandidateProfile(candidateProfiles[realgmId], row);
        }
      });
    });
  });

  const profiles = Object.fromEntries(Object.entries(candidateProfiles)
    .filter(([realgmId]) => {
      const entry = players[realgmId];
      return Array.isArray(entry)
        && (Number.isFinite(entry[DATASET_SLOTS.d1[0]]) || Number.isFinite(entry[DATASET_SLOTS.nba[0]]));
    })
    .map(([realgmId, profile]) => [
      realgmId,
      [
        profile.name || "",
        profile.dob || "",
        Array.from(profile.heights).sort((left, right) => left - right),
      ],
    ]));

  const bundle = {
    version: 1,
    generatedAt: new Date().toISOString(),
    slots: ["d1_min", "d1_max", "d2_min", "d2_max", "naia_min", "naia_max", "juco_min", "juco_max", "nba_min", "nba_max"],
    players,
    profiles,
  };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `window.STATUS_REALGM_INDEX = ${JSON.stringify(bundle)};\n`, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Players indexed: ${Object.keys(players).length}`);
}

main();
