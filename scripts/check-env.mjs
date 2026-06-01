import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve("apps/app/.env");
const requiredKeys = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"];

if (!existsSync(envPath)) {
  console.error("Missing apps/app/.env. Copy apps/app/.env.example to apps/app/.env and fill Supabase values.");
  process.exit(1);
}

const content = readFileSync(envPath, "utf8");
const values = Object.fromEntries(
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return index === -1 ? [line, ""] : [line.slice(0, index), line.slice(index + 1)];
    })
);

const missing = requiredKeys.filter((key) => {
  const value = values[key]?.trim();
  return !value || value.includes("your-project") || value.includes("your-anon-key");
});

if (missing.length > 0) {
  console.error(`Missing or placeholder env values: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Supabase environment variables are configured.");
