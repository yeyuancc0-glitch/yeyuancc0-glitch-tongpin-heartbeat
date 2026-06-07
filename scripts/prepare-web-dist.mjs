import { cp, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "apps", "app", "dist");

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(distDir))) {
  console.log("Web dist post-processing skipped: apps/app/dist does not exist.");
  process.exit(0);
}

const entries = await readdir(distDir, { withFileTypes: true });
let copied = 0;

for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith(".html") || entry.name === "index.html") {
    continue;
  }
  const routeName = entry.name.slice(0, -".html".length);
  if (!routeName || routeName.startsWith("_")) {
    continue;
  }
  const routeDir = path.join(distDir, routeName);
  await mkdir(routeDir, { recursive: true });
  await cp(path.join(distDir, entry.name), path.join(routeDir, "index.html"));
  copied += 1;
}

console.log(`Web dist post-processing complete: prepared ${copied} extensionless route(s).`);
