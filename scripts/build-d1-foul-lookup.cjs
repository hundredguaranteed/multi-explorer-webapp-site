const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const D1_EXTRAS_PATH = path.join(ROOT, "data", "vendor", "d1_extras.js");
const OUT_PATH = path.join(ROOT, "data", "vendor", "d1_foul_lookup.js");

function roundNumber(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function main() {
  const source = fs.readFileSync(D1_EXTRAS_PATH, "utf8");
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${source}\nthis.__ADV_HEADERS = ADV_HEADERS; this.__ADV_DATA = ADV_DATA;`, sandbox, {
    filename: D1_EXTRAS_PATH,
  });
  const headers = Array.isArray(sandbox.__ADV_HEADERS) ? sandbox.__ADV_HEADERS : [];
  const data = sandbox.__ADV_DATA || {};
  const index = Object.fromEntries(headers.map((header, idx) => [header, idx]));
  const lookup = {};
  Object.entries(data).forEach(([key, values]) => {
    if (!Array.isArray(values)) return;
    const [seasonFromKey = ""] = key.split("|");
    const season = String(values[index.year] || seasonFromKey || "").trim();
    const realgmId = String(values[index.pid] || "").trim();
    const gp = Number(values[index.GP]);
    const mpg = Number(values[index.mp]);
    const pfPer40 = Number(values[index.pfr]);
    if (!season || !realgmId || !Number.isFinite(gp) || gp <= 0 || !Number.isFinite(mpg) || mpg <= 0 || !Number.isFinite(pfPer40)) return;
    const minutes = gp * mpg;
    const pf = (pfPer40 * minutes) / 40;
    lookup[`${realgmId}|${season}`] = [
      roundNumber(pf, 1),
      roundNumber(pf / gp, 2),
      roundNumber(pfPer40, 1),
    ];
  });
  fs.writeFileSync(OUT_PATH, `window.D1_FOUL_LOOKUP=${JSON.stringify(lookup)};\n`, "utf8");
  console.log(`Wrote ${Object.keys(lookup).length} D1 foul lookup rows to ${path.relative(ROOT, OUT_PATH)}`);
}

main();
