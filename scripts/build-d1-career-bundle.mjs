import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outPath = path.join(rootDir, "data", "vendor", "d1_career_rows.js");
const tmpPath = `${outPath}.tmp`;
const port = Number(process.env.D1_CAREER_BUILD_PORT || 8791);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

function safeJoin(base, requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0].split("#")[0]);
  const clean = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.resolve(base, `.${clean}`);
  return resolved.startsWith(base) ? resolved : "";
}

function startServer() {
  const server = http.createServer((req, res) => {
    const filePath = safeJoin(rootDir, req.url || "/");
    if (!filePath) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.rmSync(tmpPath, { force: true });
    await page.exposeFunction("writeD1CareerBundleChunk", (chunk) => {
      fs.appendFileSync(tmpPath, chunk, "utf8");
    });
    await page.goto(`http://127.0.0.1:${port}/#d1`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForFunction(
      () => document.querySelectorAll("#statsTableBody tr:not(.empty-state)").length > 0,
      null,
      { timeout: 120000 },
    );
    const result = await page.evaluate(async () => {
      const dataset = getCurrentDataset();
      const years = getAvailableYears(dataset);
      await ensureDatasetYearsLoaded(dataset, years);
      const state = createInitialUiState(dataset);
      state.extraSelects.view_mode = "career";
      state.years = new Set(years);
      const rows = buildCareerRows(dataset, state);
      const columnSet = new Set([
        ...(dataset.meta.allColumns || []),
        dataset.yearColumn,
        dataset.playerColumn,
        dataset.teamColumn,
        "player_id",
        "source_player_id",
        "canonical_player_id",
        "player_search_text",
        "team_search_text",
        "coach_search_text",
        "dob",
        "inches",
        "height_in",
        "draft_pick",
        "rookie_year",
      ].filter(Boolean));
      const columns = Array.from(columnSet);
      const escapeCsv = (value) => {
        if (value == null || (typeof value === "number" && !Number.isFinite(value))) return "";
        const text = String(value);
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      await window.writeD1CareerBundleChunk(`window.D1_CAREER_CSV = ${JSON.stringify(`${columns.map(escapeCsv).join(",")}\n`)};\n`);
      const batchSize = 200;
      for (let index = 0; index < rows.length; index += batchSize) {
        const csv = rows
          .slice(index, index + batchSize)
          .map((row) => columns.map((column) => escapeCsv(row?.[column])).join(","))
          .join("\n");
        await window.writeD1CareerBundleChunk(`window.D1_CAREER_CSV += ${JSON.stringify(`${csv}\n`)};\n`);
      }
      const foster = rows.find((row) => /Caleb Foster/i.test(row.player_name || ""));
      return {
        years,
        rowCount: rows.length,
        columnCount: columns.length,
        foster: foster ? {
          gp: foster.gp,
          min_per: foster.min_per,
          blk_pct: foster.blk_pct,
          stl_pct: foster.stl_pct,
          bpm: foster.bpm,
        } : null,
      };
    });
    fs.renameSync(tmpPath, outPath);
    console.log(JSON.stringify({
      outPath,
      years: result.years,
      rowCount: result.rowCount,
      columnCount: result.columnCount,
      foster: result.foster,
    }, null, 2));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
