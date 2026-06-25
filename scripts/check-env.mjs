import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve("apps/app/.env");
const requiredKeys = ["EXPO_PUBLIC_SELF_HOST_API_URL"];
const forbiddenPublicKeys = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
];

const content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
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
  const value = (process.env[key] ?? values[key])?.trim();
  return !value || value.includes("your-api-url") || !/^https?:\/\//i.test(value);
});
const forbidden = forbiddenPublicKeys.filter((key) => {
  const value = (process.env[key] ?? values[key])?.trim();
  return Boolean(value);
});

if (missing.length > 0) {
  console.error(`Missing or placeholder env values: ${missing.join(", ")}`);
  process.exit(1);
}

if (forbidden.length > 0) {
  console.error(`Forbidden frontend Supabase env values are still present: ${forbidden.join(", ")}`);
  console.error("Remove these public Supabase values from apps/app/.env and deployment env; current runtime must use EXPO_PUBLIC_SELF_HOST_API_URL.");
  process.exit(1);
}

console.log("Self-host environment variables are configured.");
