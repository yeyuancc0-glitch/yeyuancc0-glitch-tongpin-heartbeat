#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const printBaseline = args.has("--print-baseline");

const scanRoots = ["apps/app", "supabase/functions"];
const ignoredPathParts = [
  `${path.sep}dist${path.sep}`,
  `${path.sep}.expo${path.sep}`,
  `${path.sep}public${path.sep}live2d${path.sep}core${path.sep}live2dcubismcore.min.js`,
];
const allowedStrictPaths = new Set([
  "apps/app/lib/supabase/database.types.ts",
  "supabase/functions/pet-ai-brain/index.ts",
  "supabase/functions/send-push-notifications/index.ts",
]);

const baselineCounts = {
  "supabase/functions/pet-ai-brain/index.ts": 3,
  "supabase/functions/send-push-notifications/index.ts": 7,
};

const patterns = [
  { name: "supabase.auth", regex: /\bsupabase\.auth\b/ },
  { name: "supabase.from", regex: /\bsupabase\.from\s*\(/ },
  { name: "supabase.rpc", regex: /\bsupabase\.rpc\s*\(/ },
  { name: "supabase.storage", regex: /\bsupabase\.storage\b/ },
  { name: "supabase.channel", regex: /\bsupabase\.channel\s*\(/ },
  { name: "supabase.removeChannel", regex: /\bsupabase\.removeChannel\s*\(/ },
  { name: "supabase.functions.invoke", regex: /\bsupabase\.functions\.invoke\s*\(/ },
  { name: "chained .from", regex: /^\s*\.from\s*\(/ },
  { name: "chained .rpc", regex: /^\s*\.rpc\s*\(/ },
  { name: "edge client rpc", regex: /\b(?:adminClient|userClient|client)\.rpc\s*\(/ },
];

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (ignoredPathParts.some((part) => fullPath.includes(part))) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function relative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function countHits(filePath) {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        hits.push({ line: index + 1, pattern: pattern.name, text: line.trim() });
        break;
      }
    }
  });
  return hits;
}

const existingRoots = scanRoots.map((item) => path.join(root, item)).filter((item) => {
  try {
    return statSync(item).isDirectory();
  } catch {
    return false;
  }
});

const current = {};
const hitDetails = {};
for (const scanRoot of existingRoots) {
  for (const filePath of walk(scanRoot)) {
    const rel = relative(filePath);
    const hits = countHits(filePath);
    if (hits.length > 0) {
      current[rel] = hits.length;
      hitDetails[rel] = hits;
    }
  }
}

if (printBaseline) {
  console.log(JSON.stringify(current, null, 2));
  process.exit(0);
}

const failures = [];
const allFiles = new Set([...Object.keys(current), ...Object.keys(baselineCounts)]);

for (const file of [...allFiles].sort()) {
  const currentCount = current[file] ?? 0;
  const baselineCount = baselineCounts[file] ?? 0;
  if (strict) {
    if (!allowedStrictPaths.has(file) && currentCount > 0) {
      failures.push(`${file}: ${currentCount} Supabase direct usage(s) remain`);
    }
    continue;
  }
  if (currentCount > baselineCount) {
    failures.push(`${file}: ${currentCount} usage(s), baseline allows ${baselineCount}`);
  }
}

if (failures.length > 0) {
  console.error("Supabase direct usage check failed.");
  console.error("Default mode blocks new direct Supabase usage beyond the recorded baseline.");
  console.error("Use --strict to require all app business direct usage to be removed.");
  for (const failure of failures) {
    console.error(`- ${failure}`);
    const [file] = failure.split(":");
    for (const hit of hitDetails[file] ?? []) {
      console.error(`  ${hit.line}: ${hit.pattern}: ${hit.text}`);
    }
  }
  process.exit(1);
}

console.log(strict ? "Strict Supabase direct usage check passed." : "Supabase direct usage baseline check passed.");
