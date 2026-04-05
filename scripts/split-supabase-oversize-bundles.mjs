import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const MAX_PART_BYTES = 12 * 1024 * 1024;

function toPosix(value) {
  return value.split(path.sep).join("/");
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function splitTextByBytes(text, maxBytes = MAX_PART_BYTES) {
  const lines = text.match(/[^\n]*\n|[^\n]+/g) || [text];
  const parts = [];
  let current = [];
  let currentBytes = 0;
  const flush = () => {
    if (!current.length) return;
    parts.push(current.join(""));
    current = [];
    currentBytes = 0;
  };
  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line, "utf8");
    if (current.length && currentBytes + lineBytes > maxBytes) {
      flush();
    }
    current.push(line);
    currentBytes += lineBytes;
  }
  flush();
  return parts.length ? parts : [text];
}

function buildPartIds(count) {
  return Array.from({ length: count }, (_, index) => `part-${String(index + 1).padStart(3, "0")}`);
}

function extractWindowStringAssignment(sourceText) {
  const match = sourceText.match(/^window\.(\w+)\s*=\s*("(?:\\.|[^"])*");\s*$/s);
  if (!match) throw new Error("Expected window.<name> = \"...\" assignment.");
  return { globalName: match[1], text: JSON.parse(match[2]) };
}

function extractWindowStoreStringAssignment(sourceText) {
  const lines = sourceText.split(/\r?\n/);
  if (lines.length < 2) throw new Error("Expected store assignment source.");
  const storeLine = lines[0];
  const assignText = lines.slice(1).join("\n");
  const match = assignText.match(/^window\.(\w+)\["([^"]+)"\]\s*=\s*("(?:\\.|[^"])*");\s*$/s);
  if (!match) throw new Error("Expected window.<store>[\"key\"] = \"...\" assignment.");
  return { storeInit: storeLine, storeName: match[1], key: match[2], text: JSON.parse(match[3]) };
}

async function writeText(filePath, text) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, text, "utf8");
}

async function createCsvMultipartBundle({
  rootFile,
  manifestFile,
  partsDir,
  manifestVarName,
  bootstrapFile,
}) {
  const sourceText = await fs.readFile(rootFile, "utf8");
  let parsed;
  try {
    parsed = extractWindowStringAssignment(sourceText);
  } catch (error) {
    try {
      await fs.access(manifestFile);
      return;
    } catch {
      throw error;
    }
  }
  const { globalName, text } = parsed;
  const textParts = splitTextByBytes(text);
  const partIds = buildPartIds(textParts.length);
  await writeText(
    manifestFile,
    `window.${manifestVarName} = ${JSON.stringify(partIds)};\n`,
  );
  await ensureDir(partsDir);
  for (let index = 0; index < partIds.length; index += 1) {
    const partId = partIds[index];
    await writeText(
      path.join(partsDir, `${partId}.js`),
      `window.${globalName} = (window.${globalName} || "") + ${JSON.stringify(textParts[index])};\n`,
    );
  }

  const manifestName = path.basename(manifestFile);
  const partsDirName = path.basename(partsDir);
  const bootstrap = [
    "(function () {",
    `  const current = document.currentScript;`,
    "  if (!current || !current.src) return;",
    "  const baseUrl = new URL('.', current.src);",
    "  function fetchText(relativePath) {",
    "    const xhr = new XMLHttpRequest();",
    "    xhr.open('GET', new URL(relativePath, baseUrl).href, false);",
    "    xhr.send(null);",
    "    if (xhr.status >= 200 && xhr.status < 300) return xhr.responseText;",
    "    throw new Error(`Failed to load ${relativePath}: ${xhr.status}`);",
    "  }",
    "  const globalEval = (0, eval);",
    `  window.${globalName} = "";`,
    `  globalEval(fetchText(${JSON.stringify(manifestName)}));`,
    `  const parts = Array.isArray(window.${manifestVarName}) ? window.${manifestVarName} : [];`,
    "  parts.forEach((part) => {",
    `    globalEval(fetchText(${JSON.stringify(`${partsDirName}/`)} + String(part) + '.js'));`,
    "  });",
    "}());",
    "",
  ].join("\n");
  await writeText(bootstrapFile, bootstrap);
}

function splitLinesByBytes(lines, maxBytes = MAX_PART_BYTES, prefix = "", suffix = "") {
  const groups = [];
  let current = [];
  let currentBytes = Buffer.byteLength(prefix, "utf8") + Buffer.byteLength(`\n${suffix}`, "utf8");
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
    currentBytes = Buffer.byteLength(prefix, "utf8") + Buffer.byteLength(`\n${suffix}`, "utf8");
  };
  lines.forEach((line) => {
    const lineBytes = Buffer.byteLength(`${line}\n`, "utf8");
    if (current.length && currentBytes + lineBytes > maxBytes) {
      flush();
    }
    current.push(line);
    currentBytes += lineBytes;
  });
  flush();
  return groups;
}

async function createD1FrontendMultipartBundle({
  sourceFile,
  manifestFile,
  partsDir,
  bootstrapFile,
}) {
  const sourceText = await fs.readFile(sourceFile, "utf8");
  const playtypesMatch = sourceText.match(/^const PLAYTYPES = [^\n]+;/m);
  const metricsMatch = sourceText.match(/^const METRICS = [^\n]+;/m);
  const runnerMetricsMatch = sourceText.match(/^const RUNNER_METRICS = [^\n]+;/m);
  const playersStart = sourceText.indexOf("const playersData = [");
  let playersEnd = sourceText.indexOf("\nconst fetchData", playersStart);
  if (playersEnd < 0) playersEnd = sourceText.lastIndexOf("];");
  if (!playtypesMatch || !metricsMatch || !runnerMetricsMatch || playersStart < 0 || playersEnd < 0 || playersEnd <= playersStart) {
    try {
      await fs.access(manifestFile);
      return;
    } catch {
      throw new Error("Unable to parse d1_frontend_data.js");
    }
  }
  const playersBody = sourceText
    .slice(playersStart + "const playersData = [".length, playersEnd)
    .replace(/^\r?\n/, "")
    .replace(/\]\s*;?\s*$/, "");
  const playerLines = playersBody.split("\n").filter(Boolean);
  const prefix = [
    playtypesMatch[0].replace("const ", "window."),
    metricsMatch[0].replace("const ", "window."),
    runnerMetricsMatch[0].replace("const ", "window."),
    "window.playersData = window.playersData || [];",
    "window.playersData.push(",
  ].join("\n");
  const suffix = ");";
  const groups = splitLinesByBytes(playerLines, MAX_PART_BYTES, prefix, suffix);
  const partIds = buildPartIds(groups.length);
  await writeText(manifestFile, `window.D1_FRONTEND_DATA_PARTS = ${JSON.stringify(partIds)};\n`);
  await ensureDir(partsDir);
  for (let index = 0; index < groups.length; index += 1) {
    const lines = groups[index];
    const header = index === 0
      ? [
          playtypesMatch[0].replace("const ", "window."),
          metricsMatch[0].replace("const ", "window."),
          runnerMetricsMatch[0].replace("const ", "window."),
          "window.playersData = window.playersData || [];",
        ].join("\n") + "\n"
      : "";
    const body = `${header}window.playersData.push(\n${lines.join("\n")}\n);\n`;
    await writeText(path.join(partsDir, `${partIds[index]}.js`), body);
  }

  const manifestName = path.basename(manifestFile);
  const partsDirName = path.basename(partsDir);
  const bootstrap = [
    "(function () {",
    "  const current = document.currentScript;",
    "  if (!current || !current.src) return;",
    "  const baseUrl = new URL('.', current.src);",
    "  function fetchText(relativePath) {",
    "    const xhr = new XMLHttpRequest();",
    "    xhr.open('GET', new URL(relativePath, baseUrl).href, false);",
    "    xhr.send(null);",
    "    if (xhr.status >= 200 && xhr.status < 300) return xhr.responseText;",
    "    throw new Error(`Failed to load ${relativePath}: ${xhr.status}`);",
    "  }",
    "  const globalEval = (0, eval);",
    "  window.playersData = [];",
    "  globalEval(fetchText(" + JSON.stringify(manifestName) + "));",
    "  const parts = Array.isArray(window.D1_FRONTEND_DATA_PARTS) ? window.D1_FRONTEND_DATA_PARTS : [];",
    "  parts.forEach((part) => {",
    "    globalEval(fetchText(" + JSON.stringify(`${partsDirName}/`) + " + String(part) + '.js'));",
    "  });",
    "}());",
    "",
  ].join("\n");
  await writeText(bootstrapFile, bootstrap);
}

async function createStoreMultipartBundle({
  sourceFile,
  bootstrapFile,
  partsDir,
  partMap,
  mapKey,
}) {
  const sourceText = await fs.readFile(sourceFile, "utf8");
  let parsed;
  try {
    parsed = extractWindowStoreStringAssignment(sourceText);
  } catch (error) {
    try {
      const existingFiles = await fs.readdir(partsDir);
      const existingParts = existingFiles
        .filter((fileName) => fileName.startsWith(`${mapKey}-part-`) && fileName.endsWith(".js"))
        .map((fileName) => fileName.replace(/\.js$/i, ""))
        .sort();
      if (existingParts.length) {
        partMap[mapKey] = existingParts;
        return;
      }
      throw error;
    } catch {
      throw error;
    }
  }
  const { storeInit, storeName, key, text } = parsed;
  const textParts = splitTextByBytes(text);
  const partIds = buildPartIds(textParts.length).map((partId) => `${mapKey}-${partId}`);
  partMap[key] = partIds;

  await ensureDir(partsDir);
  for (let index = 0; index < partIds.length; index += 1) {
    await writeText(
      path.join(partsDir, `${partIds[index]}.js`),
      [
        `window.${storeName} = window.${storeName} || {};`,
        `window.${storeName}[${JSON.stringify(key)}] = (window.${storeName}[${JSON.stringify(key)}] || "") + ${JSON.stringify(textParts[index])};`,
        "",
      ].join("\n"),
    );
  }

  await writeText(
    bootstrapFile,
    [
      storeInit,
      `window.${storeName}[${JSON.stringify(key)}] = window.${storeName}[${JSON.stringify(key)}] || "";`,
      "",
    ].join("\n"),
  );
}

async function patchPlayerCareerChunkManifest(manifestFile, multipartMap) {
  const original = await fs.readFile(manifestFile, "utf8");
  const orderMatch = original.match(/window\.PLAYER_CAREER_CHUNK_ORDER = (\[[\s\S]*?\]);/);
  if (!orderMatch) throw new Error("Unable to parse player career chunk manifest.");
  const order = JSON.parse(orderMatch[1]);
  const nextText = [
    `window.PLAYER_CAREER_CHUNK_ORDER = ${JSON.stringify(order)};`,
    `window.PLAYER_CAREER_CHUNK_MULTIPART = ${JSON.stringify(multipartMap)};`,
    "",
  ].join("\n");
  await writeText(manifestFile, nextText);
}

async function patchPlayerCareerYearManifest(manifestFile, multipartYearChunks) {
  const original = await fs.readFile(manifestFile, "utf8");
  const headerLines = [];
  const bodyLines = [];
  original.split(/\r?\n/).forEach((line) => {
    if (!bodyLines.length && line.trim().startsWith("window.PLAYER_CAREER_YEAR_MANIFEST =")) {
      bodyLines.push(line);
    } else if (!bodyLines.length) {
      headerLines.push(line);
    } else {
      bodyLines.push(line);
    }
  });
  const bodyText = bodyLines.join("\n");
  const jsonMatch = bodyText.match(/^window\.PLAYER_CAREER_YEAR_MANIFEST = ([\s\S]*);\s*$/);
  if (!jsonMatch) throw new Error("Unable to parse player career year manifest.");
  const manifest = JSON.parse(jsonMatch[1]);
  manifest.multipartYearChunks = multipartYearChunks;
  const nextText = [
    ...headerLines,
    `window.PLAYER_CAREER_YEAR_MANIFEST = ${JSON.stringify(manifest, null, 2)};`,
    "",
  ].join("\n");
  await writeText(manifestFile, nextText);
}

async function main() {
  const dataRoot = path.join(projectRoot, "data");

  await createCsvMultipartBundle({
    rootFile: path.join(dataRoot, "d1_enriched_all_seasons.js"),
    manifestFile: path.join(dataRoot, "vendor", "d1_enriched_all_seasons_manifest.js"),
    partsDir: path.join(dataRoot, "vendor", "d1_enriched_all_seasons_parts"),
    manifestVarName: "D1_ENRICHED_ALL_SEASONS_PARTS",
    bootstrapFile: path.join(dataRoot, "d1_enriched_all_seasons.js"),
  });

  await createCsvMultipartBundle({
    rootFile: path.join(dataRoot, "d1_playtype_all_seasons.js"),
    manifestFile: path.join(dataRoot, "vendor", "d1_playtype_all_seasons_manifest.js"),
    partsDir: path.join(dataRoot, "vendor", "d1_playtype_all_seasons_parts"),
    manifestVarName: "D1_PLAYTYPE_ALL_SEASONS_PARTS",
    bootstrapFile: path.join(dataRoot, "d1_playtype_all_seasons.js"),
  });

  await createCsvMultipartBundle({
    rootFile: path.join(dataRoot, "vendor", "naia_all_seasons.js"),
    manifestFile: path.join(dataRoot, "vendor", "naia_all_seasons_manifest.js"),
    partsDir: path.join(dataRoot, "vendor", "naia_all_seasons_parts"),
    manifestVarName: "NAIA_ALL_SEASONS_PARTS",
    bootstrapFile: path.join(dataRoot, "vendor", "naia_all_seasons.js"),
  });

  await createCsvMultipartBundle({
    rootFile: path.join(dataRoot, "d2_all_seasons.js"),
    manifestFile: path.join(dataRoot, "vendor", "d2_all_seasons_manifest.js"),
    partsDir: path.join(dataRoot, "vendor", "d2_all_seasons_parts"),
    manifestVarName: "D2_ALL_SEASONS_PARTS",
    bootstrapFile: path.join(dataRoot, "d2_all_seasons.js"),
  });

  await createCsvMultipartBundle({
    rootFile: path.join(dataRoot, "vendor", "juco_all_seasons.js"),
    manifestFile: path.join(dataRoot, "vendor", "juco_all_seasons_manifest.js"),
    partsDir: path.join(dataRoot, "vendor", "juco_all_seasons_parts"),
    manifestVarName: "JUCO_ALL_SEASONS_PARTS",
    bootstrapFile: path.join(dataRoot, "vendor", "juco_all_seasons.js"),
  });

  await createD1FrontendMultipartBundle({
    sourceFile: path.join(dataRoot, "vendor", "d1_frontend_data.js"),
    manifestFile: path.join(dataRoot, "vendor", "d1_frontend_data_manifest.js"),
    partsDir: path.join(dataRoot, "vendor", "d1_frontend_data_parts"),
    bootstrapFile: path.join(dataRoot, "vendor", "d1_frontend_data.js"),
  });

  const playerCareerChunkMultipart = {};
  await createStoreMultipartBundle({
    sourceFile: path.join(dataRoot, "vendor", "player_career_chunks", "part-002.js"),
    bootstrapFile: path.join(dataRoot, "vendor", "player_career_chunks", "part-002.js"),
    partsDir: path.join(dataRoot, "vendor", "player_career_chunk_parts"),
    partMap: playerCareerChunkMultipart,
    mapKey: "part-002",
  });
  await patchPlayerCareerChunkManifest(
    path.join(dataRoot, "vendor", "player_career_manifest.js"),
    playerCareerChunkMultipart,
  );

  const playerCareerYearMultipart = {};
  await createStoreMultipartBundle({
    sourceFile: path.join(dataRoot, "vendor", "player_career_year_chunks", "2025.js"),
    bootstrapFile: path.join(dataRoot, "vendor", "player_career_year_chunks", "2025.js"),
    partsDir: path.join(dataRoot, "vendor", "player_career_year_chunk_parts"),
    partMap: playerCareerYearMultipart,
    mapKey: "2025",
  });
  await patchPlayerCareerYearManifest(
    path.join(dataRoot, "vendor", "player_career_year_manifest.js"),
    playerCareerYearMultipart,
  );

  console.log("Generated Supabase-safe multipart assets.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
