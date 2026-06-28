import { cp, mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "apps", "app", "dist");
const appAssetsDir = path.join(rootDir, "apps", "app", "assets");

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

let copied = 0;

async function copyMisnamedExpoStaticDir() {
  const expoDir = path.join(distDir, "_expo");
  if (!(await exists(expoDir))) {
    return false;
  }

  const expoEntries = await readdir(expoDir, { withFileTypes: true });
  const staticDir = path.join(expoDir, "static");
  let repaired = false;

  for (const entry of expoEntries) {
    if (!entry.isDirectory() || !/^static\s+\d+$/.test(entry.name)) {
      continue;
    }

    await cp(path.join(expoDir, entry.name), staticDir, { recursive: true });
    repaired = true;
  }

  return repaired;
}

async function assertReferencedAssetsExist() {
  const htmlFiles = await collectFiles(distDir, (filePath) => filePath.endsWith(".html"));
  const missingAssets = [];
  const assetPattern = /(?:src|href)="(\/_expo\/static\/[^"]+)"/g;

  for (const htmlFile of htmlFiles) {
    const relativePath = path.relative(distDir, htmlFile);
    const html = await readFile(htmlFile, "utf8");
    for (const match of html.matchAll(assetPattern)) {
      const assetPath = path.join(distDir, match[1].slice(1));
      if (!(await exists(assetPath))) {
        missingAssets.push(`${relativePath}: ${match[1]}`);
        continue;
      }

      const assetStat = await stat(assetPath);
      if (!assetStat.isFile() || assetStat.size === 0) {
        missingAssets.push(`${relativePath}: ${match[1]} (${assetStat.size} bytes)`);
      }
    }
  }

  if (missingAssets.length > 0) {
    throw new Error(`Web dist has missing or empty referenced asset(s):\n${missingAssets.join("\n")}`);
  }
}

async function collectFiles(dir, predicate) {
  const files = [];
  if (!(await exists(dir))) {
    return files;
  }

  const visit = async (currentDir) => {
    const currentEntries = await readdir(currentDir, { withFileTypes: true });
    await Promise.all(
      currentEntries.map(async (entry) => {
        const entryPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await visit(entryPath);
          return;
        }
        if (entry.isFile() && predicate(entryPath)) {
          files.push(entryPath);
        }
      })
    );
  };

  await visit(dir);
  return files;
}

function sourceAssetPathForBundledUri(uri) {
  const match = uri.match(/^\/assets\/assets\/(.+)\.[a-f0-9]{32}\.([a-z0-9]+)$/i);
  if (!match) {
    return null;
  }

  return path.join(appAssetsDir, `${match[1]}.${match[2]}`);
}

async function copyBundledAssetUris() {
  const jsFiles = await collectFiles(distDir, (filePath) => filePath.endsWith(".js"));
  const assetUris = new Set();
  const assetUriPattern = /"((?:\/assets\/assets\/)[^"]+\.(?:png|jpe?g|webp|gif|svg))"/g;

  for (const jsFile of jsFiles) {
    const source = await readFile(jsFile, "utf8");
    for (const match of source.matchAll(assetUriPattern)) {
      assetUris.add(match[1]);
    }
  }

  const missingAssets = [];
  let copiedAssets = 0;
  for (const uri of assetUris) {
    const sourcePath = sourceAssetPathForBundledUri(uri);
    const targetPath = path.join(distDir, uri.slice(1));
    if (!sourcePath || !(await exists(sourcePath))) {
      missingAssets.push(`${uri}: source asset not found`);
      continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath);
    copiedAssets += 1;
  }

  if (missingAssets.length > 0) {
    throw new Error(`Web dist has bundled asset URI(s) that cannot be copied:\n${missingAssets.join("\n")}`);
  }

  return copiedAssets;
}

const repairedExpoStaticDir = await copyMisnamedExpoStaticDir();
const copiedBundledAssets = await copyBundledAssetUris();

const htmlFiles = await collectFiles(distDir, (filePath) => {
  if (!filePath.endsWith(".html")) {
    return false;
  }
  const relativePath = path.relative(distDir, filePath);
  return relativePath !== "index.html" && !relativePath.startsWith(`_${path.sep}`);
});

for (const htmlFile of htmlFiles) {
  const relativePath = path.relative(distDir, htmlFile);
  if (relativePath.split(path.sep).some((part) => part === "index.html")) {
    continue;
  }
  const routeName = relativePath.slice(0, -".html".length);
  if (!routeName || routeName.startsWith("_")) {
    continue;
  }
  const routeDir = path.join(distDir, routeName);
  await mkdir(routeDir, { recursive: true });
  await cp(htmlFile, path.join(routeDir, "index.html"));
  copied += 1;
}

await assertReferencedAssetsExist();

console.log(
  `Web dist post-processing complete: prepared ${copied} extensionless route(s), copied ${copiedBundledAssets} bundled asset(s)${
    repairedExpoStaticDir ? ", repaired Expo static assets" : ""
  }.`
);
