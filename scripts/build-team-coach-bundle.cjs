const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, ".pwtmp");
const PLAYTYPE_BASE_DIR = process.env.TEAM_PLAYTYPE_DIR || "C:\\Users\\anu5c\\Projects\\TeamCoachingInfo\\Team Playtype Data";
const PLAYTYPE_DIR = fs.existsSync(path.join(PLAYTYPE_BASE_DIR, "D1")) ? path.join(PLAYTYPE_BASE_DIR, "D1") : PLAYTYPE_BASE_DIR;
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

const PLAYTYPE_METRICS = [
  ["freq", "%Time"],
  ["poss", "Poss"],
  ["ppp", "PPP"],
  ["efg_pct", "eFG%"],
  ["to_pct", "TO%"],
  ["score_pct", "Score%"],
  ["fg_pct", "FG%"],
  ["three_pa_rate", "3PA/FGA"],
  ["ft_rate", "FTA/FGA"],
];

const OMIT_PLAYTYPE_COLUMNS = new Set(["post_up_three_pa_rate", "cut_three_pa_rate"]);

const BART_AUX_SOURCES = {
  avg_height: {
    url: "https://barttorvik.com/all_avg_ht.json",
    cacheName: "bart-all-avg-ht.json",
  },
  eff_height: {
    url: "https://barttorvik.com/all_eff_ht.json",
    cacheName: "bart-all-eff-ht.json",
  },
  exp: {
    url: "https://barttorvik.com/exp_history.json?new",
    cacheName: "bart-exp-history-new.json",
  },
  talent: {
    url: "https://barttorvik.com/effective_talent.json",
    cacheName: "bart-effective-talent.json",
  },
};

const ALIAS_REVERSE_CACHE = new WeakMap();
const TEAM_ALIAS_KEYS_CACHE = new WeakMap();

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
  "adj_ne",
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
  "playtype_total_poss",
];

Object.values(PLAYTYPE_NAME_TO_ID).forEach((id) => {
  PLAYTYPE_METRICS.forEach(([suffix]) => {
    const column = `${id}_${suffix}`;
    if (!OMIT_PLAYTYPE_COLUMNS.has(column)) COLUMNS.push(column);
  });
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

const TEAM_MASCOT_SUFFIX_RE = /\b(49ers|aggies|anteaters|bears|bearcats|bengals|bison|blackbirds|blue devils|bluejays|bobcats|broncos|bruin|bruins|bulldogs|cardinals|cavaliers|colonels|colonials|commodores|cougars|cowboys|crusaders|dons|dragons|dukes|eagles|falcons|flames|friars|gaels|gators|golden bears|golden eagles|hawks|highlanders|hilltoppers|horned frogs|hornets|huskies|jaguars|jayhawks|lions|lobos|longhorns|minutemen|mountaineers|mustangs|nittany lions|owls|panthers|patriots|pilots|pioneers|pirates|rams|razorbacks|rebels|red raiders|redbirds|retrievers|road runners|roadrunners|seawolves|spartans|spiders|tar heels|terriers|tigers|titans|toreros|trojans|volunteers|wildcats|wolf pack|wolfpack|wolverines|yellow jackets)$/i;
const GENERIC_TEAM_ALIAS_KEYS = new Set(["state", "st", "saint", "university", "college", "the"]);
const MANUAL_D1_TEAM_ALIASES = {
  byu: "Brigham Young",
  smu: "Southern Methodist",
  "n c state": "North Carolina State",
  "nc state": "North Carolina State",
  "cal baptist": "California Baptist",
  "cal baptist university": "California Baptist",
  penn: "Pennsylvania",
  fiu: "Florida International",
  "detroit mercy": "Detroit",
  liu: "Long Island",
  "iu indy": "Indianapolis",
  iupui: "Indianapolis",
  utsa: "Texas San Antonio",
  vmi: "Virginia Military",
  "texas a and m corpus chris": "Texas A&M Corpus Christi",
  "texas a m corpus chris": "Texas A&M Corpus Christi",
};

function stripTeamSuffixKey(value) {
  return normalizeKey(value)
    .replace(TEAM_MASCOT_SUFFIX_RE, "")
    .replace(/\b(university|college|the)\b/g, " ")
    .replace(/\bof\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addExpandedTeamKeys(keys, value) {
  const normalized = normalizeKey(value);
  const stripped = stripTeamSuffixKey(value);
  [normalized, stripped].filter(Boolean).forEach((key) => {
    keys.add(key);
    keys.add(key.replace(/\s+/g, ""));
    if (/\bst\b/.test(key)) {
      keys.add(key.replace(/\bst\b/g, "state"));
      keys.add(key.replace(/\bst\b/g, "saint"));
      keys.add(key.replace(/\bst\b/g, "state").replace(/\s+/g, ""));
      keys.add(key.replace(/\bst\b/g, "saint").replace(/\s+/g, ""));
    }
    if (/\bstate\b/.test(key)) {
      keys.add(key.replace(/\bstate\b/g, "st"));
      keys.add(key.replace(/\bstate\b/g, "st").replace(/\s+/g, ""));
    }
    if (/\bsaint\b/.test(key)) {
      keys.add(key.replace(/\bsaint\b/g, "st"));
      keys.add(key.replace(/\bsaint\b/g, "st").replace(/\s+/g, ""));
    }
  });
}

function parseNumber(value) {
  const text = cleanText(value).replace(/,/g, "").replace(/%$/, "");
  if (!text) return "";
  const numeric = Number(text);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(6)) : "";
}

function roundNumber(value, digits = 6) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function medianNumber(values) {
  const sorted = (values || []).map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return "";
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
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
  if (MANUAL_D1_TEAM_ALIASES[key]) return MANUAL_D1_TEAM_ALIASES[key];
  if (aliasMap.has(key)) return aliasMap.get(key);
  const stripped = stripTeamSuffixKey(value);
  if (MANUAL_D1_TEAM_ALIASES[stripped]) return MANUAL_D1_TEAM_ALIASES[stripped];
  if (aliasMap.has(stripped)) return aliasMap.get(stripped);
  const expanded = new Set();
  addExpandedTeamKeys(expanded, value);
  for (const candidate of expanded) {
    if (aliasMap.has(candidate)) return aliasMap.get(candidate);
  }
  return aliasMap.get(stripped) || cleanText(value).replace(TEAM_MASCOT_SUFFIX_RE, "").trim();
}

function teamAliasKeys(value, aliasMap) {
  if (!aliasMap || !aliasMap.size) {
    const keys = new Set();
    addExpandedTeamKeys(keys, value);
    return Array.from(keys).filter(Boolean);
  }
  let memo = TEAM_ALIAS_KEYS_CACHE.get(aliasMap);
  if (!memo) {
    memo = new Map();
    TEAM_ALIAS_KEYS_CACHE.set(aliasMap, memo);
  }
  const memoKey = normalizeKey(value);
  if (memo.has(memoKey)) return memo.get(memoKey);
  const keys = new Set();
  addExpandedTeamKeys(keys, value);
  const canonical = canonicalTeam(value, aliasMap);
  addExpandedTeamKeys(keys, canonical);
  const direct = aliasMap.get(normalizeKey(value)) || aliasMap.get(stripTeamSuffixKey(value));
  addExpandedTeamKeys(keys, direct);
  if (canonical) {
    (getAliasReverseMap(aliasMap).get(normalizeKey(canonical)) || []).forEach((aliasKey) => addExpandedTeamKeys(keys, aliasKey));
  }
  const out = Array.from(keys).filter((key) => key && !GENERIC_TEAM_ALIAS_KEYS.has(key));
  memo.set(memoKey, out);
  return out;
}

function getAliasReverseMap(aliasMap) {
  if (ALIAS_REVERSE_CACHE.has(aliasMap)) return ALIAS_REVERSE_CACHE.get(aliasMap);
  const reverse = new Map();
  for (const [aliasKey, aliasCanonical] of aliasMap.entries()) {
    const canonicalKey = normalizeKey(aliasCanonical);
    if (!canonicalKey) continue;
    if (!reverse.has(canonicalKey)) reverse.set(canonicalKey, []);
    reverse.get(canonicalKey).push(aliasKey);
  }
  ALIAS_REVERSE_CACHE.set(aliasMap, reverse);
  return reverse;
}

function teamKeySetsOverlap(left, right) {
  const rightSet = new Set(right || []);
  return (left || []).some((key) => rightSet.has(key));
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

async function fetchJsonWithCache(url, cacheName, options = {}) {
  return JSON.parse(await fetchWithCache(url, cacheName, options));
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

function buildAuxStatIndex(raw, aliasMap) {
  const index = new Map();
  Object.entries(raw || {}).forEach(([year, values]) => {
    const byTeam = new Map();
    Object.entries(values || {}).forEach(([team, value]) => {
      const numeric = parseNumber(value);
      if (numeric === "") return;
      const keys = new Set([
        normalizeKey(team),
        normalizeKey(canonicalTeam(team, aliasMap)),
        ...teamAliasKeys(team, aliasMap),
      ]);
      keys.forEach((key) => {
        if (key && !byTeam.has(key)) byTeam.set(key, numeric);
      });
    });
    index.set(String(year), byTeam);
  });
  return index;
}

async function loadBartAuxiliaryIndexes(aliasMap) {
  const output = {};
  await Promise.all(Object.entries(BART_AUX_SOURCES).map(async ([column, source]) => {
    const raw = await fetchJsonWithCache(source.url, source.cacheName);
    output[column] = buildAuxStatIndex(raw, aliasMap);
  }));
  return output;
}

function lookupAuxStat(auxIndexes, column, year, team, rawTeam, aliasMap) {
  const yearMap = auxIndexes?.[column]?.get(String(year));
  if (!yearMap) return "";
  const keys = new Set([
    normalizeKey(team),
    normalizeKey(rawTeam),
    ...teamAliasKeys(team, aliasMap),
    ...teamAliasKeys(rawTeam, aliasMap),
  ]);
  for (const key of keys) {
    if (key && yearMap.has(key)) return yearMap.get(key);
  }
  return "";
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
        if (!team || !conf) return;
        teamAliasKeys(team, aliasMap).forEach((key) => {
          const mapKey = `${year}|${key}`;
          if (!map.has(mapKey)) map.set(mapKey, conf);
        });
      });
    });
  return map;
}

function listCsvFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...listCsvFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".csv")) {
      output.push(fullPath);
    }
  });
  return output;
}

function loadPlaytypeRows(aliasMap) {
  const byPrimaryTeam = new Map();
  const byLookupKey = new Map();
  listCsvFiles(PLAYTYPE_DIR)
    .forEach((filePath) => {
      const file = path.basename(filePath);
      const match = file.match(/(\d{4})-(\d{4}).+ - (.+) - Team Offensive(?: \(\d+\))?\.csv$/);
      if (!match) return;
      const season = match[2];
      const playtypeId = PLAYTYPE_NAME_TO_ID[match[3]];
      if (!playtypeId) return;
      const rows = rowsToObjects(parseCsv(fs.readFileSync(filePath, "utf8")));
      rows.forEach((source) => {
        const team = canonicalTeam(source.Team, aliasMap);
        if (!team) return;
        const primaryKey = `${season}|${normalizeKey(team)}`;
        if (!byPrimaryTeam.has(primaryKey)) byPrimaryTeam.set(primaryKey, { season, team_name: team });
        const row = byPrimaryTeam.get(primaryKey);
        PLAYTYPE_METRICS.forEach(([suffix, sourceColumn]) => {
          const column = `${playtypeId}_${suffix}`;
          if (!OMIT_PLAYTYPE_COLUMNS.has(column)) row[column] = parseNumber(source[sourceColumn]);
        });
        const poss = parseNumber(source.Poss);
        const freq = parseNumber(source["%Time"]);
        if (Number.isFinite(poss) && poss > 0 && Number.isFinite(freq) && freq > 0) {
          const estimates = row._playtypeTotalPossEstimates || (row._playtypeTotalPossEstimates = []);
          estimates.push(poss / (freq / 100));
        }
        teamAliasKeys(source.Team, aliasMap).concat(teamAliasKeys(team, aliasMap)).forEach((lookupKey) => {
          byLookupKey.set(`${season}|${lookupKey}`, row);
        });
      });
    });
  byPrimaryTeam.forEach((row) => {
    const estimate = medianNumber(row._playtypeTotalPossEstimates);
    if (estimate !== "") row.playtype_total_poss = roundNumber(estimate, 1);
    delete row._playtypeTotalPossEstimates;
  });
  return { rows: byPrimaryTeam, index: byLookupKey };
}

function lookupPlaytypeRow(playtypes, year, team, rawTeam, aliasMap) {
  const keys = new Set([
    ...teamAliasKeys(team, aliasMap),
    ...teamAliasKeys(rawTeam, aliasMap),
  ]);
  for (const key of keys) {
    const row = playtypes.index.get(`${year}|${key}`);
    if (row) return row;
  }
  return null;
}

function coachForTeam(coachDict, year, team, aliasMap) {
  const yearDict = coachDict[String(year)] || {};
  const direct = yearDict[team] || yearDict[canonicalTeam(team, aliasMap)];
  if (direct) return cleanText(direct);
  const targetKeys = teamAliasKeys(team, aliasMap);
  for (const [candidate, coach] of Object.entries(yearDict)) {
    if (teamKeySetsOverlap(targetKeys, teamAliasKeys(candidate, aliasMap))) return cleanText(coach);
  }
  return "";
}

async function main() {
  const aliasMap = loadAliasMap();
  const coachDict = loadCoachDict();
  const conferences = loadD1ConferenceMap(aliasMap);
  const playtypes = loadPlaytypeRows(aliasMap);
  const auxStats = await loadBartAuxiliaryIndexes(aliasMap);
  const years = Array.from(new Set(Array.from(playtypes.rows.values()).map((row) => row.season))).sort();
  const rows = [];
  let playtypeMatched = 0;
  for (const year of years) {
    const gdata = await fetchBartTeamTable(year);
    gdata.forEach((entry) => {
      const team = canonicalTeam(entry[0], aliasMap);
      if (!team) return;
      const playtypeRow = lookupPlaytypeRow(playtypes, year, team, entry[0], aliasMap);
      if (playtypeRow) playtypeMatched += 1;
      const row = { ...(playtypeRow || {}), season: Number(year), team_name: team };
      BART_FIELDS.forEach(([column, index]) => {
        if (column === "team_name") return;
        row[column] = typeof entry[index] === "number" ? Number(entry[index].toFixed(6)) : cleanText(entry[index]);
      });
      ["avg_height", "eff_height", "exp", "talent"].forEach((column) => {
        const auxValue = lookupAuxStat(auxStats, column, year, team, entry[0], aliasMap);
        if (auxValue !== "" && (row[column] === "" || row[column] == null || !Number.isFinite(Number(row[column])))) {
          row[column] = auxValue;
        }
      });
      if (Number.isFinite(row.adj_oe) && Number.isFinite(row.adj_de)) {
        row.adj_ne = roundNumber(row.adj_oe - row.adj_de, 3);
      }
      row.coach = coachForTeam(coachDict, year, team, aliasMap);
      row.conference = teamAliasKeys(team, aliasMap).map((key) => conferences.get(`${year}|${key}`)).find(Boolean) || "";
      row.team_search_text = normalizeKey([team, entry[0], ...teamAliasKeys(team, aliasMap)].filter(Boolean).join(" "));
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
  console.log(`Wrote ${rows.length} team/coach rows to ${path.relative(ROOT, OUT_PATH)} (${playtypeMatched} matched playtype rows)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
