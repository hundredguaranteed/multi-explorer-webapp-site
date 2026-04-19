const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, ".pwtmp");
const FIBA_PATH = path.join(ROOT, "data", "fiba_all_seasons.js");
const PLAYER_PROFILES_CSV = path.join(ROOT, "generated", "player_profiles.csv");
const COMPETITION_ID = "6366";
const PLAYER_LIST_URL = `https://www.fiba.basketball/en/history/256-fiba-u18-americup/${COMPETITION_ID}/players`;
const PLAYER_BASE_URL = `https://www.fiba.basketball`;
const SEASON = "2018";
const COMPETITION_KEY = "u18_americup";
const COMPETITION_LABEL = "FIBA U18 AmeriCup";

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeName(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (quoted) {
      if (ch === "\"") {
        if (text[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === "\"") quoted = true;
    else if (ch === ",") {
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

function rowsToObjects(rows) {
  const header = rows[0] || [];
  return rows.slice(1)
    .filter((row) => row.some((cell) => cleanText(cell)))
    .map((row) => Object.fromEntries(header.map((column, index) => [column, row[index] ?? ""])));
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function dictRowsToCsv(rows, columns) {
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column] ?? "")).join(",")),
  ].join("\n");
}

function parseCurrentFibaCsv() {
  global.window = global;
  delete require.cache[require.resolve(FIBA_PATH)];
  require(FIBA_PATH);
  const csv = String(global.FIBA_ALL_CSV || "");
  const parsed = parseCsv(csv);
  return { columns: parsed[0] || [], rows: rowsToObjects(parsed) };
}

function loadUniqueProfileNameMap() {
  const map = new Map();
  if (!fs.existsSync(PLAYER_PROFILES_CSV)) return map;
  rowsToObjects(parseCsv(fs.readFileSync(PLAYER_PROFILES_CSV, "utf8"))).forEach((row) => {
    const key = normalizeName(row.player_name);
    const realgmId = cleanText(row.realgm_player_id);
    if (!key || !realgmId) return;
    if (map.has(key)) {
      map.set(key, null);
    } else {
      map.set(key, {
        realgm_player_id: realgmId,
        canonical_player_id: cleanText(row.canonical_player_id) || `rgm_${realgmId}`,
        realgm_summary_url: cleanText(row.summary_url),
        profile_career_path: cleanText(row.career_path),
        profile_levels: cleanText(row.profile_levels),
        dob: cleanText(row.born_iso),
        height_in: cleanText(row.height_in),
        weight_lb: cleanText(row.weight_lb),
      });
    }
  });
  Array.from(map.entries()).forEach(([key, value]) => {
    if (!value) map.delete(key);
  });
  return map;
}

function applyUniqueProfileMatch(row, profileNameMap) {
  if (cleanText(row.realgm_player_id)) return false;
  if (cleanText(row.season) !== SEASON || cleanText(row.competition_key) !== COMPETITION_KEY) return false;
  const profile = profileNameMap.get(normalizeName(row.player_name));
  if (!profile) return false;
  row.realgm_player_id = profile.realgm_player_id;
  row.canonical_player_id = profile.canonical_player_id;
  row.player_profile_key = profile.canonical_player_id;
  row.realgm_summary_url = profile.realgm_summary_url;
  row.profile_match_source = "realgm_name_unique";
  row.profile_career_path = profile.profile_career_path;
  row.profile_levels = profile.profile_levels;
  if (!cleanText(row.dob) && profile.dob) row.dob = profile.dob;
  if (!cleanText(row.height_in) && profile.height_in) row.height_in = profile.height_in;
  if (!cleanText(row.weight_lb) && profile.weight_lb) row.weight_lb = profile.weight_lb;
  return true;
}

async function fetchWithCache(url, cacheName) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, cacheName);
  if (fs.existsSync(cachePath) && !process.env.FORCE_FETCH) {
    return fs.readFileSync(cachePath, "utf8");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed ${response.status} ${url}`);
  const text = await response.text();
  fs.writeFileSync(cachePath, text, "utf8");
  return text;
}

function extractPlayerLinks(html) {
  const links = new Map();
  const regex = /href="(\/en\/history\/256-fiba-u18-americup\/6366\/players\/(\d+)-[^"]+)"/g;
  let match;
  while ((match = regex.exec(html))) {
    links.set(match[2], match[1]);
  }
  return Array.from(links.entries()).map(([playerId, href]) => ({ playerId, href }));
}

function extractEscapedObject(html, key, requiredField = "") {
  const marker = `\\"${key}\\":`;
  let searchFrom = 0;
  while (searchFrom < html.length) {
    const markerIndex = html.indexOf(marker, searchFrom);
    if (markerIndex < 0) return null;
    const start = html.indexOf("{", markerIndex + marker.length);
    if (start < 0) return null;
    let depth = 0;
    for (let index = start; index < html.length; index += 1) {
      const ch = html[index];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const raw = html.slice(start, index + 1).replace(/\\"/g, "\"");
          const parsed = JSON.parse(raw);
          if (!requiredField || Object.prototype.hasOwnProperty.call(parsed, requiredField)) return parsed;
          searchFrom = index + 1;
          break;
        }
      }
    }
    searchFrom = Math.max(searchFrom, markerIndex + marker.length);
  }
  return null;
}

function titleName(html, fallbackHref) {
  const title = html.match(/<title>([^<]+?)\s+-\s+[^<]+?Player profile/i)?.[1];
  if (title) return cleanText(title);
  const slug = fallbackHref.split("/").pop()?.replace(/^\d+-/, "") || "";
  return slug.split("-").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function round(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  const factor = 10 ** digits;
  const rounded = Math.round(numeric * factor) / factor;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function pct(made, attempts) {
  const madeValue = Number(made);
  const attemptValue = Number(attempts);
  if (!Number.isFinite(madeValue) || !Number.isFinite(attemptValue)) return "";
  if (attemptValue === 0) return "0";
  return round((madeValue / attemptValue) * 100, 3);
}

function ratio(left, right) {
  const leftValue = Number(left);
  const rightValue = Number(right);
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue) || rightValue === 0) return "";
  return round(leftValue / rightValue, 3);
}

function buildRow(playerId, href, html) {
  const stats = extractEscapedObject(html, "playerStats", "totalGamesPlayed");
  if (!stats || !Number(stats.totalGamesPlayed)) return null;
  const games = extractEscapedObject(html, "playerGamesStats", "gameStatistics");
  const firstGame = games?.gameStatistics?.[0] || {};
  const fgm = stats.totalFieldGoalsMade;
  const fga = stats.totalFieldGoalsAttempted;
  const threePm = stats.totalThreePointsMade;
  const threePa = stats.totalThreePointsAttempted;
  const ftm = stats.totalFreeThrowsMade;
  const fta = stats.totalFreeThrowsAttempted;
  const pts = stats.totalPoints;
  const row = {
    season: SEASON,
    competition_key: COMPETITION_KEY,
    competition_label: COMPETITION_LABEL,
    edition_id: COMPETITION_ID,
    player_id: playerId,
    player_name: titleName(html, href),
    team_name: cleanText(firstGame.teamName || firstGame.teamCode),
    team_code: cleanText(firstGame.teamCode),
    nationality: cleanText(firstGame.teamCode),
    gp: round(stats.totalGamesPlayed, 0),
    min: round(Number(stats.totalPlayTimeInSeconds || 0) / 60, 3),
    mpg: round(Number(stats.playTimeInSecondsPerGame || 0) / 60, 3),
    pts: round(pts, 3),
    trb: round(stats.totalRebounds, 3),
    orb: round(stats.totalReboundsOffensive, 3),
    drb: round(stats.totalReboundsDefensive, 3),
    ast: round(stats.totalAssists, 3),
    stl: round(stats.totalSteals, 3),
    blk: round(stats.totalBlocks, 3),
    tov: round(stats.totalTurnovers, 3),
    pf: round(stats.totalFouls, 3),
    plus_minus: round(stats.totalPlusMinus, 3),
    plus_minus_pg: round(stats.plusMinusPerGame, 3),
    eff: round(stats.totalEfficiency, 3),
    eff_pg: round(stats.efficiencyPerGame, 3),
    fgm: round(fgm, 3),
    fga: round(fga, 3),
    fg_pct: round(stats.fieldGoalsPercentage, 3) || pct(fgm, fga),
    "2pm": round(stats.totalTwoPointsMade, 3),
    "2pa": round(stats.totalTwoPointsAttempted, 3),
    "2p_pct": round(stats.twoPointsPercentage, 3) || pct(stats.totalTwoPointsMade, stats.totalTwoPointsAttempted),
    "3pm": round(threePm, 3),
    "3pa": round(threePa, 3),
    tp_pct: round(stats.threePointsPercentage, 3) || pct(threePm, threePa),
    ftm: round(ftm, 3),
    fta: round(fta, 3),
    ft_pct: round(stats.freeThrowsPercentage, 3) || pct(ftm, fta),
    efg_pct: pct(Number(fgm || 0) + (0.5 * Number(threePm || 0)), fga),
    ts_pct: pct(pts, 2 * (Number(fga || 0) + (0.44 * Number(fta || 0)))),
    ast_to: ratio(stats.totalAssists, stats.totalTurnovers),
  };
  return row;
}

function hasUsefulStats(row) {
  return ["gp", "min", "mpg", "pts", "trb", "ast", "stl", "blk", "tov", "fgm", "fga", "ftm", "fta"].some((column) => {
    const value = Number(row[column]);
    if (!Number.isFinite(value)) return false;
    return ["gp", "min", "mpg"].includes(column) ? value > 0 : Math.abs(value) > 0;
  });
}

async function main() {
  const { columns, rows } = parseCurrentFibaCsv();
  const profileNameMap = loadUniqueProfileNameMap();
  const existingKeySet = new Set(rows.map((row) => `${row.season}|${row.competition_key}|${row.player_id}`));
  const listHtml = await fetchWithCache(PLAYER_LIST_URL, "fiba-u18-2018-players.html");
  const links = extractPlayerLinks(listHtml);
  const newRows = [];
  for (const { playerId, href } of links) {
    const key = `${SEASON}|${COMPETITION_KEY}|${playerId}`;
    if (existingKeySet.has(key)) continue;
    const html = await fetchWithCache(`${PLAYER_BASE_URL}${href}`, `fiba-u18-2018-player-${playerId}.html`);
    const row = buildRow(playerId, href, html);
    if (row && hasUsefulStats(row)) {
      applyUniqueProfileMatch(row, profileNameMap);
      newRows.push(row);
    }
  }
  const filteredRows = rows.filter(hasUsefulStats);
  let updatedMatches = 0;
  filteredRows.forEach((row) => {
    if (applyUniqueProfileMatch(row, profileNameMap)) updatedMatches += 1;
  });
  const merged = filteredRows.concat(newRows);
  const csv = dictRowsToCsv(merged, columns);
  fs.writeFileSync(FIBA_PATH, `window.FIBA_ALL_CSV = ${JSON.stringify(csv)};\n`, "utf8");
  console.log(`Removed ${rows.length - filteredRows.length} statless FIBA rows; added ${newRows.length} U18 AmeriCup 2018 rows; matched ${updatedMatches} existing rows by unique RealGM name.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
