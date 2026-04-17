import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const GENERATED_DIR = path.join(REPO_ROOT, "generated", "international_extraction");
const CACHE_DIR = path.join(GENERATED_DIR, "cache");
const VENDOR_DIR = path.join(REPO_ROOT, "data", "vendor");
const REALGM_ORIGIN = "https://basketball.realgm.com";
const CHUNK_SIZE = 8_000_000;

const LEAGUES = [
  [5, "Australian NBL", "Australian-NBL", "/international/league/5/Australian-NBL/players/1389/2026"],
  [2, "Eurocup", "Eurocup", "/international/league/2/Eurocup/players/1421"],
  [1, "Euroleague", "Euroleague", "/international/league/1/Euroleague/players/1419"],
  [12, "French Jeep Elite", "French-Jeep-Elite", "/international/league/12/French-Jeep-Elite/players/1348"],
  [15, "German BBL", "German-BBL", "/international/league/15/German-BBL/players/1351"],
  [11, "Israeli BSL", "Israeli-BSL", "/international/league/11/Israeli-BSL/players/1347"],
  [4, "Spanish ACB", "Spanish-ACB", "/international/league/4/Spanish-ACB/players/1342"],
  [7, "Turkish BSL", "Turkish-BSL", "/international/league/7/Turkish-BSL/players/1344"],
  [18, "Adriatic League Liga ABA", "Adriatic-League-Liga-ABA", "/international/league/18/Adriatic-League-Liga-ABA/players/1431"],
].map(([id, name, slug, playersPath]) => ({ id, name, slug, playersPath }));

const STAT_TYPES = [
  ["Averages", "points"],
  ["Totals", "points"],
  ["Per_40", "points"],
  ["Per_36", "points"],
  ["Per_48", "points"],
  ["Per_Minute", "points"],
  ["Minute_Per", "points"],
  ["Misc_Stats", "double_doubles"],
  ["Advanced_Stats", "ts_pct"],
].map(([key, sort]) => ({ key, sort }));

const CORE_COLUMNS = [
  "season", "season_label", "league_id", "league_name", "league_slug", "competition_key", "competition_label",
  "player_name", "realgm_player_id", "realgm_summary_url", "team_name", "team_abbrev", "team_url",
  "pos", "height", "height_in", "weight_lb", "birth_city", "draft_status", "nationality",
];

const BOX_COLUMNS = [
  "gp", "min", "mpg", "pts", "pts_pg", "trb", "trb_pg", "orb", "orb_pg", "drb", "drb_pg",
  "ast", "ast_pg", "stl", "stl_pg", "blk", "blk_pg", "stocks", "stocks_pg", "ast_stl_pg",
  "tov", "tov_pg", "pf", "pf_pg", "fgm", "fgm_pg", "fga", "fga_pg", "fg_pct",
  "two_pm", "two_pm_pg", "two_pa", "two_pa_pg", "two_p_pct", "three_pm", "three_pm_pg",
  "three_pa", "three_pa_pg", "three_p_pct", "ftm", "ftm_pg", "fta", "fta_pg", "ft_pct",
  "efg_pct", "ts_pct", "total_s_pct", "ftr", "three_pr",
];

const RATE_COLUMNS = [
  "pts_per40", "trb_per40", "orb_per40", "drb_per40", "ast_per40", "stl_per40", "blk_per40",
  "stocks_per40", "ast_stl_per40", "tov_per40", "pf_per40", "fgm_per40", "fga_per40",
  "two_pm_per40", "two_pa_per40", "three_pm_per40", "three_pa_per40", "ftm_per40", "fta_per40",
  "pts_per36", "trb_per36", "ast_per36", "stl_per36", "blk_per36", "tov_per36", "pf_per36",
  "pts_per48", "trb_per48", "ast_per48", "stl_per48", "blk_per48", "tov_per48", "pf_per48",
  "pts_per_min", "trb_per_min", "ast_per_min", "stl_per_min", "blk_per_min", "tov_per_min", "pf_per_min",
  "min_per_pts", "min_per_trb", "min_per_ast", "min_per_stl", "min_per_blk", "min_per_tov", "min_per_pf",
];

const ADV_MISC_COLUMNS = [
  "orb_pct", "drb_pct", "trb_pct", "ast_pct", "tov_pct", "stl_pct", "blk_pct", "usg_pct",
  "ppr", "pps", "ortg", "drtg", "ediff", "fic", "per", "double_doubles", "triple_doubles",
  "forty_pts_games", "twenty_reb_games", "twenty_ast_games", "five_stl_games", "five_blk_games",
  "high_game", "techs", "hob", "ast_to", "stl_to", "ftm_fga", "wins", "losses", "win_pct", "ows", "dws", "ws",
];

const OVERLAY_START_COLUMNS = [
  "player_id", "canonical_player_id", "realgm_player_id", "source_player_id", "player_profile_key",
  "player_name", "season", "source_dataset", "competition_level", "team_name", "team_full", "league",
  "career_path", "profile_levels", "profile_match_source", "realgm_summary_url", "nationality", "birth_city",
  "pre_draft_team", "height_in", "weight_lb", "pos", "draft_pick",
];

function parseArgs() {
  const args = new Map();
  process.argv.slice(2).forEach((arg) => {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) args.set(match[1], match[2]);
    else if (arg.startsWith("--")) args.set(arg.slice(2), "true");
  });
  return args;
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeName(value) {
  let text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (!letters) return text;
  const upperRatio = letters.split("").filter((char) => char === char.toUpperCase()).length / letters.length;
  const needsCleanup = upperRatio >= 0.7 || text.split(/\s+/).some((part) => {
    const onlyLetters = part.replace(/[^A-Za-z]/g, "");
    return onlyLetters.length > 1 && onlyLetters === onlyLetters.toUpperCase();
  });
  if (!needsCleanup) return text;
  return text
    .split(/(\s+|-|')/)
    .map((part) => {
      const onlyLetters = part.replace(/[^A-Za-z]/g, "");
      if (!onlyLetters) return part;
      if (onlyLetters.length === 1) return part.toUpperCase();
      const lower = part.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("")
    .replace(/\bMc([a-z])/g, (_, letter) => `Mc${letter.toUpperCase()}`)
    .replace(/\bO'([a-z])/g, (_, letter) => `O'${letter.toUpperCase()}`)
    .replace(/\b([A-Z]{2,})'(?=[A-Z][a-z])/g, (_, prefix) => `${prefix.charAt(0)}${prefix.slice(1).toLowerCase()}'`)
    .replace(/\bJR\.?$/i, "Jr.")
    .replace(/\bSR\.?$/i, "Sr.")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePos(value) {
  return String(value || "").trim().toUpperCase()
    .replace(/^G-F$/, "G/F").replace(/^F-G$/, "G/F")
    .replace(/^GF$/, "G/F").replace(/^FG$/, "G/F")
    .replace(/^F-C$/, "F/C").replace(/^C-F$/, "F/C")
    .replace(/^FC$/, "F/C").replace(/^CF$/, "F/C");
}

function toNumber(value) {
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!text || text === "-") return "";
  if (!/^-?(?:\d+|\d*\.\d+)$/.test(text)) return text;
  const number = Number(text);
  return Number.isFinite(number) ? number : "";
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function addNumbers(...values) {
  return values.every((value) => Number.isFinite(value)) ? values.reduce((sum, value) => sum + value, 0) : "";
}

function ratio(numerator, denominator, digits = 3) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? round(numerator / denominator, digits)
    : "";
}

function perGame(total, gp, digits = 2) {
  return Number.isFinite(total) && Number.isFinite(gp) && gp > 0 ? round(total / gp, digits) : "";
}

function per40(total, min, digits = 2) {
  return Number.isFinite(total) && Number.isFinite(min) && min > 0 ? round((total / min) * 40, digits) : "";
}

function heightToInches(value) {
  const match = String(value || "").trim().match(/^(\d+)-(\d+)$/);
  return match ? (Number(match[1]) * 12) + Number(match[2]) : "";
}

function absoluteUrl(value) {
  if (!value) return "";
  return value.startsWith("http") ? value : `${REALGM_ORIGIN}${value}`;
}

function extractPlayerId(href = "") {
  const match = String(href).match(/\/Summary\/(\d+)/i);
  return match ? match[1] : "";
}

function parseSeasonOption(option) {
  const value = String(option.value || "");
  const seasonMatch = value.match(/\/stats\/(\d{4})(?:\/|$)/i) || value.match(/\/players\/\d+\/(\d{4})(?:\/|$)/i);
  const textMatch = String(option.text || "").match(/(\d{4})-(\d{4})/);
  const endYear = seasonMatch ? seasonMatch[1] : (textMatch ? textMatch[2] : "");
  if (!endYear) return null;
  return {
    season: String(Number(endYear)),
    season_label: textMatch ? `${textMatch[1]}-${textMatch[2]}` : String(option.text || "").trim(),
    path: value,
  };
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function gotoWithRetry(page, url, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForFunction(() => !/Just a moment/i.test(document.title), null, { timeout: 20_000 }).catch(() => {});
      await page.waitForSelector("table.table", { timeout: 40_000 });
      return;
    } catch (error) {
      lastError = error;
      console.warn(`Retry ${attempt}/3 for ${label}: ${error.message}`);
      await page.waitForTimeout(2_000 * attempt);
    }
  }
  throw lastError || new Error(`Failed to load ${url}`);
}

async function extractSelectOptions(page, selectIndex = 0) {
  return page.evaluate((index) => {
    const select = document.querySelectorAll("select")[index];
    if (!select) return [];
    return Array.from(select.options).map((option) => ({
      text: option.textContent.trim(),
      value: option.getAttribute("value") || option.value || "",
    }));
  }, selectIndex);
}

async function extractTable(page) {
  await page.waitForFunction(() => {
    const table = document.querySelector("table.table");
    if (!table) return false;
    if (window.$ && typeof window.$ === "function") {
      try {
        return Array.isArray(window.$(table).bootstrapTable("getData"));
      } catch {
        return Boolean(table.querySelector("tbody tr"));
      }
    }
    return Boolean(table.querySelector("tbody tr"));
  }, null, { timeout: 40_000 });

  return page.evaluate(() => {
    const table = document.querySelector("table.table");
    const headers = Array.from(table.querySelectorAll("thead th")).map((th, index) => th.textContent.trim() || String(index));
    const decodeCell = (html) => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html == null ? "" : String(html);
      const link = wrapper.querySelector("a");
      return {
        text: wrapper.textContent.replace(/\s+/g, " ").trim(),
        href: link ? link.getAttribute("href") || "" : "",
        title: link ? link.getAttribute("title") || "" : "",
      };
    };
    let data = [];
    if (window.$ && typeof window.$ === "function") {
      try {
        data = window.$(table).bootstrapTable("getData") || [];
      } catch {
        data = [];
      }
    }
    if (!data.length) {
      data = Array.from(table.querySelectorAll("tbody tr")).map((tr) => {
        const row = {};
        Array.from(tr.children).forEach((td, index) => {
          row[index] = td.innerHTML;
        });
        return row;
      });
    }
    const rows = data.map((row) => headers.map((header, index) => ({
      header,
      ...decodeCell(row[index]),
    })));
    return { headers, rows };
  });
}

async function discoverLeague(page, league, useCache) {
  const cacheFile = path.join(CACHE_DIR, `discover_${league.id}.json`);
  if (useCache) {
    const cached = await readJson(cacheFile);
    if (cached) return cached;
  }

  await gotoWithRetry(page, absoluteUrl(league.playersPath), `${league.name} players discovery`);
  const rosterOptions = (await extractSelectOptions(page, 0)).map(parseSeasonOption).filter(Boolean);
  const rosterBySeason = Object.fromEntries(rosterOptions.map((item) => [item.season, item]));

  await gotoWithRetry(page, `${REALGM_ORIGIN}/international/league/${league.id}/${league.slug}/stats`, `${league.name} stats discovery`);
  const statOptions = (await extractSelectOptions(page, 0)).map(parseSeasonOption).filter(Boolean);
  const discovered = {
    league,
    seasons: statOptions.map((item) => ({
      ...item,
      roster_path: rosterBySeason[item.season]?.path || "",
      roster_label: rosterBySeason[item.season]?.season_label || item.season_label,
    })),
    discovered_at: new Date().toISOString(),
  };
  await writeJson(cacheFile, discovered);
  return discovered;
}

function statUrl(league, season, statType) {
  const sort = STAT_TYPES.find((item) => item.key === statType)?.sort || "points";
  return `${REALGM_ORIGIN}/international/league/${league.id}/${league.slug}/stats/${season}/${statType}/All/All/${sort}/All/desc/1/Regular_Season`;
}

async function scrapeRoster(page, league, season, rosterPath, useCache) {
  const cacheFile = path.join(CACHE_DIR, `roster_${league.id}_${season}.json`);
  if (useCache) {
    const cached = await readJson(cacheFile);
    if (cached) return cached;
  }
  if (!rosterPath) return { headers: [], rows: [] };
  await gotoWithRetry(page, absoluteUrl(rosterPath), `${league.name} ${season} roster`);
  const table = await extractTable(page);
  await writeJson(cacheFile, table);
  return table;
}

async function scrapeStats(page, league, season, statType, useCache) {
  const cacheFile = path.join(CACHE_DIR, `stats_${league.id}_${season}_${statType}.json`);
  if (useCache) {
    const cached = await readJson(cacheFile);
    if (cached) return cached;
  }
  await gotoWithRetry(page, statUrl(league, season, statType), `${league.name} ${season} ${statType}`);
  const table = await extractTable(page);
  await writeJson(cacheFile, table);
  return table;
}

function cellMap(cells) {
  const out = new Map();
  cells.forEach((cell) => out.set(cell.header, cell));
  return out;
}

function rowKey(base) {
  return [
    base.league_id,
    base.season,
    base.realgm_player_id || normalizeKey(base.player_name),
    normalizeKey(base.team_name || base.team_abbrev),
  ].join("|");
}

function baseRow(league, seasonInfo, playerCell, teamCell) {
  const playerHref = playerCell?.href || "";
  const realgmId = extractPlayerId(playerHref);
  const teamName = teamCell?.title || teamCell?.text || "";
  return {
    season: seasonInfo.season,
    season_label: seasonInfo.season_label,
    league_id: league.id,
    league_name: league.name,
    league_slug: league.slug,
    competition_key: `realgm_international_${league.id}`,
    competition_label: league.name,
    player_name: normalizeName(playerCell?.text || ""),
    realgm_player_id: realgmId,
    realgm_summary_url: absoluteUrl(playerHref),
    team_name: teamName,
    team_abbrev: teamCell?.text || "",
    team_url: absoluteUrl(teamCell?.href || ""),
  };
}

function assign(row, key, value) {
  if (value !== "" && value != null) row[key] = value;
}

function assignNumeric(row, key, value) {
  const number = toNumber(value);
  if (number !== "") row[key] = number;
}

function applyHeaderMap(row, values, map) {
  Object.entries(map).forEach(([header, column]) => assignNumeric(row, column, values.get(header)?.text));
}

function applyStats(row, values, statType) {
  if (statType === "Averages") {
    applyHeaderMap(row, values, {
      GP: "gp", MPG: "mpg", PPG: "pts_pg", FGM: "fgm_pg", FGA: "fga_pg", "FG%": "fg_pct",
      "3PM": "three_pm_pg", "3PA": "three_pa_pg", "3P%": "three_p_pct", FTM: "ftm_pg", FTA: "fta_pg",
      "FT%": "ft_pct", ORB: "orb_pg", DRB: "drb_pg", RPG: "trb_pg", APG: "ast_pg", SPG: "stl_pg",
      BPG: "blk_pg", TOV: "tov_pg", PF: "pf_pg",
    });
    return;
  }
  if (statType === "Totals") {
    applyHeaderMap(row, values, {
      GP: "gp", MIN: "min", PTS: "pts", FGM: "fgm", FGA: "fga", "FG%": "fg_pct",
      "3PM": "three_pm", "3PA": "three_pa", "3P%": "three_p_pct", FTM: "ftm", FTA: "fta", "FT%": "ft_pct",
      ORB: "orb", DRB: "drb", REB: "trb", AST: "ast", STL: "stl", BLK: "blk", TOV: "tov", PF: "pf",
    });
    return;
  }
  if (statType === "Misc_Stats") {
    applyHeaderMap(row, values, {
      "Dbl Dbl": "double_doubles", "Tpl Dbl": "triple_doubles", "40 Pts": "forty_pts_games",
      "20 Reb": "twenty_reb_games", "20 Ast": "twenty_ast_games", "5 Stl": "five_stl_games",
      "5 Blk": "five_blk_games", "High Game": "high_game", Techs: "techs", HOB: "hob",
      "Ast/TO": "ast_to", "Stl/TO": "stl_to", "FT/FGA": "ftm_fga", "W's": "wins", "L's": "losses",
      "Win %": "win_pct", OWS: "ows", DWS: "dws", WS: "ws",
    });
    return;
  }
  if (statType === "Advanced_Stats") {
    applyHeaderMap(row, values, {
      "TS%": "ts_pct", "eFG%": "efg_pct", "Total S %": "total_s_pct", "ORB%": "orb_pct",
      "DRB%": "drb_pct", "TRB%": "trb_pct", "AST%": "ast_pct", "TOV%": "tov_pct", "STL%": "stl_pct",
      "BLK%": "blk_pct", "USG%": "usg_pct", PPR: "ppr", PPS: "pps", ORtg: "ortg", DRtg: "drtg",
      eDiff: "ediff", FIC: "fic", PER: "per",
    });
    return;
  }

  const suffix = {
    Per_40: "per40",
    Per_36: "per36",
    Per_48: "per48",
    Per_Minute: "per_min",
  }[statType];
  if (suffix) {
    applyHeaderMap(row, values, {
      PTS: `pts_${suffix}`, FGM: `fgm_${suffix}`, FGA: `fga_${suffix}`, "3PM": `three_pm_${suffix}`,
      "3PA": `three_pa_${suffix}`, FTM: `ftm_${suffix}`, FTA: `fta_${suffix}`, ORB: `orb_${suffix}`,
      DRB: `drb_${suffix}`, REB: `trb_${suffix}`, AST: `ast_${suffix}`, STL: `stl_${suffix}`,
      BLK: `blk_${suffix}`, TOV: `tov_${suffix}`, PF: `pf_${suffix}`,
    });
    return;
  }

  if (statType === "Minute_Per") {
    applyHeaderMap(row, values, {
      PTS: "min_per_pts", REB: "min_per_trb", AST: "min_per_ast", STL: "min_per_stl",
      BLK: "min_per_blk", TOV: "min_per_tov", PF: "min_per_pf",
    });
  }
}

function buildRosterMeta(table) {
  const players = [];
  const byPlayer = new Map();
  const byPlayerTeam = new Map();
  (table.rows || []).forEach((cells) => {
    const values = cellMap(cells);
    const player = values.get("Player");
    const playerId = extractPlayerId(player?.href || "");
    if (!playerId) return;
    const meta = {
      player_name: normalizeName(player.text),
      realgm_player_id: playerId,
      pos: normalizePos(values.get("Pos")?.text),
      height: values.get("HT")?.text || "",
      height_in: heightToInches(values.get("HT")?.text),
      weight_lb: toNumber(values.get("WT")?.text),
      team_name: values.get("Team")?.text || "",
      birth_city: values.get("Birth City")?.text || "",
      draft_status: values.get("Draft Status")?.text || "",
      nationality: values.get("Nationality")?.text || "",
    };
    players.push(meta);
    byPlayer.set(playerId, { ...(byPlayer.get(playerId) || {}), ...meta });
    if (meta.team_name) byPlayerTeam.set(`${playerId}|${normalizeKey(meta.team_name)}`, meta);
  });
  return { players, byPlayer, byPlayerTeam };
}

function applyRosterMeta(row, rosterMeta) {
  if (!row.realgm_player_id) return;
  const meta = rosterMeta.byPlayerTeam.get(`${row.realgm_player_id}|${normalizeKey(row.team_name || row.team_abbrev)}`)
    || rosterMeta.byPlayer.get(row.realgm_player_id);
  if (!meta) return;
  ["pos", "height", "height_in", "weight_lb", "birth_city", "draft_status", "nationality"].forEach((field) => {
    if (meta[field] !== "" && meta[field] != null) row[field] = meta[field];
  });
}

function rosterOnlyRow(league, seasonInfo, meta) {
  const realgmId = String(meta.realgm_player_id || "").trim();
  return {
    season: seasonInfo.season,
    season_label: seasonInfo.season_label,
    league_id: league.id,
    league_name: league.name,
    league_slug: league.slug,
    competition_key: `realgm_international_${league.id}`,
    competition_label: league.name,
    player_name: meta.player_name,
    realgm_player_id: realgmId,
    realgm_summary_url: realgmId ? `${REALGM_ORIGIN}/player/${meta.player_name.replace(/[^A-Za-z0-9]+/g, "-")}/Summary/${realgmId}` : "",
    team_name: meta.team_name,
    team_abbrev: "",
    pos: meta.pos,
    height: meta.height,
    height_in: meta.height_in,
    weight_lb: meta.weight_lb,
    birth_city: meta.birth_city,
    draft_status: meta.draft_status,
    nationality: meta.nationality,
  };
}

function deriveRow(row) {
  if (!Number.isFinite(row.min) && Number.isFinite(row.gp) && Number.isFinite(row.mpg)) row.min = round(row.gp * row.mpg, 3);
  if (!Number.isFinite(row.mpg) && Number.isFinite(row.min) && Number.isFinite(row.gp) && row.gp > 0) {
    row.mpg = round(row.min / row.gp, 2);
  }
  ["pts", "trb", "orb", "drb", "ast", "stl", "blk", "tov", "pf", "fgm", "fga", "three_pm", "three_pa", "ftm", "fta"].forEach((column) => {
    if (!Number.isFinite(row[`${column}_pg`])) assign(row, `${column}_pg`, perGame(row[column], row.gp));
    if (!Number.isFinite(row[`${column}_per40`])) assign(row, `${column}_per40`, per40(row[column], row.min));
  });
  if (!Number.isFinite(row.pts) && Number.isFinite(row.pts_pg) && Number.isFinite(row.gp)) row.pts = round(row.pts_pg * row.gp, 3);
  if (!Number.isFinite(row.trb) && Number.isFinite(row.trb_pg) && Number.isFinite(row.gp)) row.trb = round(row.trb_pg * row.gp, 3);
  if (!Number.isFinite(row.ast) && Number.isFinite(row.ast_pg) && Number.isFinite(row.gp)) row.ast = round(row.ast_pg * row.gp, 3);
  if (!Number.isFinite(row.stl) && Number.isFinite(row.stl_pg) && Number.isFinite(row.gp)) row.stl = round(row.stl_pg * row.gp, 3);
  if (!Number.isFinite(row.blk) && Number.isFinite(row.blk_pg) && Number.isFinite(row.gp)) row.blk = round(row.blk_pg * row.gp, 3);
  if (!Number.isFinite(row.two_pm) && Number.isFinite(row.fgm) && Number.isFinite(row.three_pm)) row.two_pm = round(row.fgm - row.three_pm, 3);
  if (!Number.isFinite(row.two_pa) && Number.isFinite(row.fga) && Number.isFinite(row.three_pa)) row.two_pa = round(row.fga - row.three_pa, 3);
  if (!Number.isFinite(row.two_pm_pg) && Number.isFinite(row.two_pm)) row.two_pm_pg = perGame(row.two_pm, row.gp);
  if (!Number.isFinite(row.two_pa_pg) && Number.isFinite(row.two_pa)) row.two_pa_pg = perGame(row.two_pa, row.gp);
  if (!Number.isFinite(row.two_pm_per40) && Number.isFinite(row.two_pm)) row.two_pm_per40 = per40(row.two_pm, row.min);
  if (!Number.isFinite(row.two_pa_per40) && Number.isFinite(row.two_pa)) row.two_pa_per40 = per40(row.two_pa, row.min);
  if (!Number.isFinite(row.two_p_pct)) row.two_p_pct = ratio(row.two_pm, row.two_pa);
  if (!Number.isFinite(row.ftr)) row.ftr = ratio(row.fta, row.fga);
  if (!Number.isFinite(row.three_pr)) row.three_pr = ratio(row.three_pa, row.fga);

  const stocks = addNumbers(row.stl, row.blk);
  const stocksPg = addNumbers(row.stl_pg, row.blk_pg);
  const stocksPer40 = addNumbers(row.stl_per40, row.blk_per40);
  const astStlPg = addNumbers(row.ast_pg, row.stl_pg);
  const astStlPer40 = addNumbers(row.ast_per40, row.stl_per40);
  if (stocks !== "") row.stocks = round(stocks, 3);
  if (stocksPg !== "") row.stocks_pg = round(stocksPg, 2);
  if (stocksPer40 !== "") row.stocks_per40 = round(stocksPer40, 2);
  if (astStlPg !== "") row.ast_stl_pg = round(astStlPg, 2);
  if (astStlPer40 !== "") row.ast_stl_per40 = round(astStlPer40, 2);
  row.player_search_text = [row.player_name, row.realgm_player_id].filter(Boolean).join(" ");
  row.team_search_text = [row.team_name, row.team_abbrev, row.league_name].filter(Boolean).join(" ");
}

function parseDraftPick(draftStatus) {
  const text = String(draftStatus || "");
  if (/undrafted/i.test(text)) return "";
  const match = text.match(/Pick\s+(\d+)/i) || text.match(/Round\s+\d+,\s*(\d+)/i);
  return match ? Number(match[1]) : "";
}

function overlayRow(row) {
  const realgmId = String(row.realgm_player_id || "").trim();
  const canonicalId = realgmId ? `rgm_${realgmId}` : "";
  return {
    player_id: canonicalId,
    canonical_player_id: canonicalId,
    realgm_player_id: realgmId,
    source_player_id: realgmId,
    player_profile_key: canonicalId,
    player_name: row.player_name,
    season: row.season,
    source_dataset: "realgm_international_extraction",
    competition_level: "International",
    team_name: row.team_abbrev || row.team_name,
    team_full: row.team_name,
    league: row.league_name,
    career_path: "International",
    profile_levels: "International",
    profile_match_source: "realgm_international_extraction",
    realgm_summary_url: row.realgm_summary_url,
    nationality: row.nationality,
    birth_city: row.birth_city,
    pre_draft_team: row.draft_status,
    height_in: row.height_in,
    weight_lb: row.weight_lb,
    pos: row.pos,
    draft_pick: parseDraftPick(row.draft_status),
    competition_key: row.competition_key,
    competition_label: row.competition_label,
    team_code: row.team_abbrev,
    player_search_text: row.player_search_text,
    team_search_text: row.team_search_text,
    ...Object.fromEntries([...BOX_COLUMNS, ...RATE_COLUMNS, ...ADV_MISC_COLUMNS]
      .filter((column) => row[column] !== "" && row[column] != null)
      .map((column) => [column, row[column]])),
  };
}

function collectColumns(rows, preferred) {
  const seen = new Set(preferred);
  rows.forEach((row) => Object.keys(row).forEach((key) => {
    if (!key.startsWith("_")) seen.add(key);
  }));
  return Array.from(seen);
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows, columns) {
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n");
}

async function cleanOutputDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function writeMultipartCsv({ csv, globalName, manifestGlobalName, stubPath, manifestPath, partsDir }) {
  await cleanOutputDir(partsDir);
  await fs.writeFile(stubPath, `window.${globalName} = window.${globalName} || "";\n`, "utf8");
  const parts = [];
  for (let offset = 0; offset < csv.length; offset += CHUNK_SIZE) {
    const partId = `part_${String(parts.length + 1).padStart(3, "0")}`;
    const file = `${partId}.js`;
    const payload = csv.slice(offset, offset + CHUNK_SIZE);
    parts.push(partId);
    await fs.writeFile(path.join(partsDir, file), `window.${globalName} = (window.${globalName} || "") + ${JSON.stringify(payload)};\n`, "utf8");
  }
  const manifest = {
    parts,
    rowCount: Math.max(0, csv.split(/\r?\n/).length - 1),
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(manifestPath, `window.${manifestGlobalName} = ${JSON.stringify(manifest, null, 2)};\n`, "utf8");
}

async function scrapeAll(options) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(VENDOR_DIR, { recursive: true });
  const requestedLeagues = new Set(String(options.get("leagues") || "").split(",").map((item) => normalizeKey(item)).filter(Boolean));
  const requestedStats = new Set(String(options.get("statTypes") || "").split(",").map((item) => item.trim()).filter(Boolean));
  const maxSeasons = Number(options.get("maxSeasons") || 0);
  const useCache = options.get("refresh") !== "true";
  const leagues = requestedLeagues.size
    ? LEAGUES.filter((league) => requestedLeagues.has(String(league.id)) || requestedLeagues.has(normalizeKey(league.name)))
    : LEAGUES;
  const statTypes = requestedStats.size
    ? STAT_TYPES.map((item) => item.key).filter((key) => requestedStats.has(key))
    : STAT_TYPES.map((item) => item.key);

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
  });
  await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
  const page = await context.newPage();
  const rowsByKey = new Map();
  const summary = [];

  try {
    for (const league of leagues) {
      const discovered = await discoverLeague(page, league, useCache);
      const seasons = maxSeasons > 0 ? discovered.seasons.slice(0, maxSeasons) : discovered.seasons;
      console.log(`${league.name}: ${seasons.length} stat seasons`);
      for (const seasonInfo of seasons) {
        const roster = await scrapeRoster(page, league, seasonInfo.season, seasonInfo.roster_path, useCache);
        const rosterMeta = buildRosterMeta(roster);
        let statPageCount = 0;
        for (const statType of statTypes) {
          const table = await scrapeStats(page, league, seasonInfo.season, statType, useCache);
          statPageCount += 1;
          (table.rows || []).forEach((cells) => {
            const values = cellMap(cells);
            const playerCell = values.get("Player");
            const teamCell = values.get("Team");
            if (!playerCell?.text) return;
            const base = baseRow(league, seasonInfo, playerCell, teamCell);
            const key = rowKey(base);
            const row = rowsByKey.get(key) || base;
            applyStats(row, values, statType);
            applyRosterMeta(row, rosterMeta);
            rowsByKey.set(key, row);
          });
        }
        rosterMeta.players.forEach((meta) => {
          const row = rosterOnlyRow(league, seasonInfo, meta);
          const key = rowKey(row);
          if (!rowsByKey.has(key)) rowsByKey.set(key, row);
        });
        console.log(`  ${seasonInfo.season}: ${statPageCount} stat pages, ${roster.rows?.length || 0} roster rows`);
      }
      summary.push({ league: league.name, seasons: seasons.length });
    }
  } finally {
    await browser.close();
  }

  const rows = Array.from(rowsByKey.values())
    .filter((row) => row.realgm_player_id && row.player_name)
    .map((row) => {
      deriveRow(row);
      return row;
    })
    .sort((left, right) => {
      const seasonDiff = Number(right.season || 0) - Number(left.season || 0);
      if (seasonDiff) return seasonDiff;
      const leagueDiff = String(left.league_name).localeCompare(String(right.league_name));
      if (leagueDiff) return leagueDiff;
      const minDiff = (Number(right.min) || 0) - (Number(left.min) || 0);
      if (minDiff) return minDiff;
      return String(left.player_name).localeCompare(String(right.player_name));
    });
  const overlayRows = rows.map(overlayRow);

  await writeMultipartCsv({
    csv: rowsToCsv(rows, collectColumns(rows, [...CORE_COLUMNS, ...BOX_COLUMNS, ...RATE_COLUMNS, ...ADV_MISC_COLUMNS])),
    globalName: "INTERNATIONAL_ALL_CSV",
    manifestGlobalName: "INTERNATIONAL_ALL_SEASONS_PARTS",
    stubPath: path.join(VENDOR_DIR, "international_all_seasons.js"),
    manifestPath: path.join(VENDOR_DIR, "international_all_seasons_manifest.js"),
    partsDir: path.join(VENDOR_DIR, "international_all_seasons_parts"),
  });
  await writeMultipartCsv({
    csv: rowsToCsv(overlayRows, collectColumns(overlayRows, [...OVERLAY_START_COLUMNS, ...BOX_COLUMNS, ...RATE_COLUMNS, ...ADV_MISC_COLUMNS])),
    globalName: "PLAYER_CAREER_INTERNATIONAL_OVERLAY_CSV",
    manifestGlobalName: "PLAYER_CAREER_INTERNATIONAL_OVERLAY_PARTS",
    stubPath: path.join(VENDOR_DIR, "player_career_international_overlay.js"),
    manifestPath: path.join(VENDOR_DIR, "player_career_international_overlay_manifest.js"),
    partsDir: path.join(VENDOR_DIR, "player_career_international_overlay_parts"),
  });
  await writeJson(path.join(GENERATED_DIR, "summary.json"), {
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    overlayRowCount: overlayRows.length,
    summary,
    statTypes,
  });
  console.log(`Wrote ${rows.length} international rows and ${overlayRows.length} Player/Career overlay rows.`);
}

scrapeAll(parseArgs()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
