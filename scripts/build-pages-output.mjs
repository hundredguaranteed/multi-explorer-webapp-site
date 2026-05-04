import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, "dist");
const staticFiles = ["index.html", "app.js", "styles.css", "sw.js"];
const staticDirectories = [];
const optionalFiles = [".nojekyll"];

async function resetDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function copyStaticFiles() {
  for (const relativePath of staticFiles) {
    const source = path.join(projectRoot, relativePath);
    const target = path.join(distDir, relativePath);
    await fs.copyFile(source, target);
  }
}

async function copyStaticDirectories() {
  for (const relativePath of staticDirectories) {
    const source = path.join(projectRoot, relativePath);
    const target = path.join(distDir, relativePath);
    await fs.cp(source, target, { recursive: true });
  }
}

async function copyOptionalFiles() {
  for (const relativePath of optionalFiles) {
    const source = path.join(projectRoot, relativePath);
    const target = path.join(distDir, relativePath);
    try {
      await fs.copyFile(source, target);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function main() {
  await resetDir(distDir);
  await copyStaticFiles();
  await copyStaticDirectories();
  await copyOptionalFiles();
  console.log(`Built Cloudflare Pages output in ${distDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
