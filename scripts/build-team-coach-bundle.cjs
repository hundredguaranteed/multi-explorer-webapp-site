const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, ".pwtmp");
const PLAYTYPE_DIR = process.env.TEAM_PLAYTYPE_DIR || "C:\\Users\\anu5c\\Projects\\TeamCoachingInfo\\Team Playtype Data";
const OUT_PATH = path.join(ROOT, "data", "vendor", "team_coach_all_seasons.js");
const ALIAS_CSV_PATH = path.join(ROOT, "generated", "team_aliases.csv");
const D1_YEAR_DIR = path.join(ROOT, "data", "vendor", "d1_year_chunks");
const D1_COACHDICT_PATH = path.join(ROOT, "data", "vendor", "d1_coachdict.js");

const PLAYTYPE_NAME_TO_ID = {
  "Transition": "transition",
  "Spot Up": "spot_up",
  "P&R Ball Handler": "pnr_ball_handler",
  "P&R Roll Man": "pnr_roll_man",
  "Post-Up": "post_up",
  "Cut": "cut",
  "Off Screen": "off_screen",
  "Hand Off": "hand_off",
  "Isolation": "isolation",
  "Offensive Rebounds": "offensive_rebounds",
};

const BART_FIELDS = [
  ["team_name", 0],
  ["adj_oe", 1],
  ["adj_de", 2],
  ["barthag", 3],
  ["record", 4],
  ["wins", 5],
  ["games", 6],
  ["efg_pct", 7],
  ["efg_pct_def", 8],
  ["ft_rate", 9],
  ["ft_rate_def", 10],
  ["tov_pct", 11],
  ["tov_pct_def", 12],
  ["oreb_pct", 13],
  ["opp_oreb_pct", 14],
  ["raw_tempo", 15],
  ["two_p_pct", 16],
  ["two_p_pct_def", 17],
  ["three_p_pct", 18],
  ["three_p_pct_def", 19],
  ["block_pct", 20],
  ["blocked_pct", 21],
  ["ast_pct", 22],
  ["opp_ast_pct", 23],
  ["three_p_rate", 24],
  ["three_p_rate_def", 25],
  ["adj_tempo", 26],
  ["avg_height", 27],
  ["eff_height", 28],
  ["exp", 29],
  ["talent", 33],
  ["ft_pct", 35],
  ["opp_ft_pct", 36],
  ["ppp_off", 37],
  ["ppp_def", 38],
  ["elite_sos", 39],
];

const COLUMNS = [
  "rank",
  "season",
  "team_name",
  "coach",
  "conference",
  "record",
  "wins",
  "games",
  "adj_oe",
  "adj_de",
  "barthag",
  "efg_pct",
  "efg_pct_def",
  "ft_rate",
  "ft_rate_def",
  "tov_pct",
  "tov_pct_def",
  "oreb_pct",
  "opp_oreb_pct",
  "raw_tempo",
  "adj_tempo",
  "two_p_pct",
  "two_p_pct_def",
  "three_p_pct",
  "three_p_pct_def",
  "block_pct",
  "blocked_pct",
  "ast_pct",
  "opp_ast_pct",
  "three_p_rate",
  "three_p_rate_def",
  "avg_height",
  "eff_height",
  "exp",
  "talent",
  "ft_pct",
  "opp_ft_pct",
  "ppp_off",
  "ppp_def",
  "elite_sos",
];

Object.values(PLAYTYPE_NAME_TO_ID).forEach((id) => {
  COLUMNS.push(
    `${id}_freq`,
    `${id}_poss`,
    `${id}_ppp`,
    `${id}_efg_pct`,
    `${id}_to_pct`,
    `${id}_score_pct`,
    `${id}_fg_pct`,
    `${id}_three_pa_rate`,
    `${id}_ft_rate`,
  );
});
COLUMNS.push("team_search_text", "coach_search_text");

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseNumber(value) {
  const text = cleanText(value).replace(/,/g, "").replace(/%$/, "");
  if (!text) return "";
  const numeric = Number(text);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(6)) : "";
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
  const headerIndex = rows.findIndex((row) => row.some((cell) => cleanText(cell) === "Team"));
  const startIndex = headerIndex >= 0 ? headerIndex : 0;
  const header = (rows[startIndex] || []).map(cleanText);
  return rows.slice(startIndex + 1)
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

function loadAliasMap() {
  const map = new Map();
  if (!fs.existsSync(ALIAS_CSV_PATH)) return map;
  rowsToObjects(parseCsv(fs.readFileSync(ALIAS_CSV_PATH, "utf8"))).forEach((row) => {
    const canonical = cleanText(row.canonical_team_name);
    if (!canonical) return;
    [row.alias_key, row.alias, row.canonical_team_name].forEach((value) => {
      const key = normalizeKey(value);
      if (key) map.set(key, canonical);
    });
  });
  return map;
}

function canonicalTeam(value, aliasMap) {
  const key = normalizeKey(value);
  if (!key) return "";
  if (aliasMap.has(key)) return aliasMap.get(key);
  const stripped = key.replace(/\b(aggies|bears|bengals|bison|blue devils|bobcats|broncos|bulldogs|cardinals|cavaliers|colonials|cowboys|crusaders|eagles|falcons|flames|friars|gaels|golden bears|golden eagles|hawks|highlanders|hornets|huskies|jaguars|lions|minutemen|mountaineers|mustangs|panthers|patriots|pilots|pioneers|rams|rebels|redbirds|seawolves|spiders|tigers|titans|trojans|wildcats|wolfpack)$/i, "").trim();
  return aliasMap.get(stripped) || cleanText(value).replace(/\s+(Aggies|Bears|Bengals|Bison|Blue Devils|Bobcats|Broncos|Bulldogs|Cardinals|Cavaliers|Colonials|Cowboys|Crusaders|Eagles|Falcons|Flames|Friars|Gaels|Golden Bears|Golden Eagles|Hawks|Highlanders|Hornets|Huskies|Jaguars|Lions|Minutemen|Mountaineers|Mustangs|Panthers|Patriots|Pilots|Pioneers|Rams|Rebels|Redbirds|Seawolves|Spiders|Tigers|Titans|Trojans|Wildcats|Wolfpack)$/i, "");
}

async function fetchWithCache(url, cacheName, options = {}) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, cacheName);
  if (fs.existsSync(cachePath) && !process.env.FORCE_FETCH) {
    return fs.readFileSync(cachePath, "utf8");
  }
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Fetch failed ${response.status} ${url}`);
  const text = await response.text();
  fs.writeFileSync(cachePath, text, "utf8");
  return text;
}

async function fetchBartTeamTable(year) {
  const url = `https://barttorvik.com/team-tables_each.php?year=${year}&top=0&conlimit=All`;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `bart-team-table-${year}.html`);
  let text = "";
  if (fs.existsSync(cachePath) && !process.env.FORCE_FETCH) {
    text = fs.readFileSync(cachePath, "utf8");
  }
  if (!text.includes("var gdata")) {
    const curl = process.platform === "win32" ? "curl.exe" : "curl";
    const cookiePath = path.join(CACHE_DIR, "bart-cookies.txt");
    text = execFileSync(curl, [
      "-L",
      "-s",
      "-c",
      cookiePath,
      "-b",
      cookiePath,
      "-d",
      "js_test_submitted=1",
      url,
    ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    fs.writeFileSync(cachePath, text, "utf8");
  }
  return extractBartGdata(text);
}

function extractBartGdata(text) {
  const marker = "var gdata";
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) throw new Error("Bart gdata not found");
  const start = text.indexOf("[", markerIndex);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const ch = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "\"") quoted = false;
      continue;
    }
    if (ch === "\"") quoted = true;
    else if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, index + 1));
    }
  }
  throw new Error("Bart gdata parse failed");
}

function loadCoachDict() {
  if (!fs.existsSync(D1_COACHDICT_PATH)) return {};
  const text = fs.readFileSync(D1_COACHDICT_PATH, "utf8");
  const match = text.match(/COACH_DICT\s*=\s*(\{[\s\S]*\});?\s*$/);
  return match ? JSON.parse(match[1]) : {};
}

function loadD1ConferenceMap(aliasMap) {
  const map = new Map();
  global.window = global;
  global.D1_YEAR_CSV_CHUNKS = {};
  if (!fs.existsSync(D1_YEAR_DIR)) return map;
  fs.readdirSync(D1_YEAR_DIR)
    .filter((file) => /^\d{4}\.js$/.test(file))
    .forEach((file) => {
      const year = path.basename(file, ".js");
      const modulePath = path.join(D1_YEAR_DIR, file);
      delete require.cache[require.resolve(modulePath)];
      require(modulePath);
      const csv = global.D1_YEAR_CSV_CHUNKS?.[year] || "";
      const rows = rowsToObjects(parseCsv(csv));
      rows.forEach((row) => {
        const team = canonicalTeam(row.team_name || row.team_full, aliasMap);
        const conf = cleanText(row.conference);
        if (team && conf && !map.has(`${year}|${normalizeKey(team)}`)) map.set(`${year}|${normalizeKey(team)}`, conf);
      });
    });
  return map;
}

function loadPlaytypeRows(aliasMap) {
  const byYearTeam = new Map();
  fs.readdirSync(PLAYTYPE_DIR)
    .filter((file) => file.endsWith(".csv"))
    .forEach((file) => {
      const match = file.match(/(\d{4})-(\d{4}).+ - (.+) - Team Offensive\.csv$/);
      if (!match) return;
      const season = match[2];
      const playtypeId = PLAYTYPE_NAME_TO_ID[match[3]];
      if (!playtypeId) return;
      const rows = rowsToObjects(parseCsv(fs.readFileSync(path.join(PLAYTYPE_DIR, file), "utf8")));
      rows.forEach((source) => {
        const team = canonicalTeam(source.Team, aliasMap);
        if (!team) return;
        const key = `${season}|${normalizeKey(team)}`;
        if (!byYearTeam.has(key)) byYearTeam.set(key, { season, team_name: team });
        const row = byYearTeam.get(key);
        row[`${playtypeId}_freq`] = parseNumber(source["%Time"]);
        row[`${playtypeId}_poss`] = parseNumber(source.Poss);
        row[`${playtypeId}_ppp`] = parseNumber(source.PPP);
        row[`${playtypeId}_efg_pct`] = parseNumber(source["eFG%"]);
        row[`${playtypeId}_to_pct`] = parseNumber(source["TO%"]);
        row[`${playtypeId}_score_pct`] = parseNumber(source["Score%"]);
        row[`${playtypeId}_fg_pct`] = parseNumber(source["FG%"]);
        row[`${playtypeId}_three_pa_rate`] = parseNumber(source["3PA/FGA"]);
        row[`${playtypeId}_ft_rate`] = parseNumber(source["FTA/FGA"]);
      });
    });
  return byYearTeam;
}

function coachForTeam(coachDict, year, team, aliasMap) {
  const yearDict = coachDict[String(year)] || {};
  const direct = yearDict[team] || yearDict[canonicalTeam(team, aliasMap)];
  if (direct) return cleanText(direct);
  const targetKey = normalizeKey(canonicalTeam(team, aliasMap));
  for (const [candidate, coach] of Object.entries(yearDict)) {
    if (normalizeKey(canonicalTeam(candidate, aliasMap)) === targetKey) return cleanText(coach);
  }
  return "";
}

async function main() {
  const aliasMap = loadAliasMap();
  const coachDict = loadCoachDict();
  const conferences = loadD1ConferenceMap(aliasMap);
  const playtypes = loadPlaytypeRows(aliasMap);
  const years = Array.from(new Set(Array.from(playtypes.values()).map((row) => row.season))).sort();
  const rows = [];
  for (const year of years) {
    const gdata = await fetchBartTeamTable(year);
    gdata.forEach((entry) => {
      const team = canonicalTeam(entry[0], aliasMap);
      if (!team) return;
      const key = `${year}|${normalizeKey(team)}`;
      const row = { ...(playtypes.get(key) || {}), season: Number(year), team_name: team };
      BART_FIELDS.forEach(([column, index]) => {
        if (column === "team_name") return;
        row[column] = typeof entry[index] === "number" ? Number(entry[index].toFixed(6)) : cleanText(entry[index]);
      });
      row.coach = coachForTeam(coachDict, year, team, aliasMap);
      row.conference = conferences.get(key) || "";
      row.team_search_text = normalizeKey([team, entry[0]].filter(Boolean).join(" "));
      row.coach_search_text = normalizeKey(row.coach);
      rows.push(row);
    });
  }
  rows.sort((left, right) => {
    const yearGap = Number(right.season) - Number(left.season);
    if (yearGap) return yearGap;
    return (Number(right.barthag) || 0) - (Number(left.barthag) || 0);
  });
  let currentYear = "";
  let rank = 0;
  rows.forEach((row) => {
    if (String(row.season) !== currentYear) {
      currentYear = String(row.season);
      rank = 0;
    }
    rank += 1;
    row.rank = rank;
  });
  const csv = dictRowsToCsv(rows, COLUMNS);
  fs.writeFileSync(OUT_PATH, `window.TEAM_COACH_ALL_CSV=${JSON.stringify(csv)};\n`, "utf8");
  console.log(`Wrote ${rows.length} team/coach rows to ${path.relative(ROOT, OUT_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
