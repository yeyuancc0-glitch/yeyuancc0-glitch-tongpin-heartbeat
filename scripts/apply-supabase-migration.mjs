import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const migrationsDir = resolve("packages/db/migrations");
const migrationPath = resolve(migrationsDir, "001_v01a_schema.sql");
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();

if (!existsSync(migrationPath)) {
  console.error(`Migration not found: ${migrationPath}`);
  process.exit(1);
}

const hasCommand = (command) =>
  spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" }).status === 0;

if (hasCommand("supabase")) {
  console.log("Applying migrations with Supabase CLI linked query. Make sure the project is linked first.");
  for (const file of migrationFiles) {
    const filePath = resolve(migrationsDir, file);
    console.log(`Applying ${file}.`);
    const result = spawnSync("supabase", ["db", "query", "--linked", "--file", filePath], {
      stdio: "inherit",
    });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
  process.exit(0);
}

if (hasCommand("psql")) {
  if (!process.env.SUPABASE_DB_URL) {
    console.error("psql is available, but SUPABASE_DB_URL is missing.");
    console.error("Set SUPABASE_DB_URL to the Supabase Postgres connection string, then rerun npm run db:apply.");
    process.exit(1);
  }

  console.log("Applying migration with psql and SUPABASE_DB_URL.");
  for (const file of migrationFiles) {
    const filePath = resolve(migrationsDir, file);
    console.log(`Applying ${file}.`);
    const result = spawnSync("psql", [process.env.SUPABASE_DB_URL, "-v", "ON_ERROR_STOP=1", "-f", filePath], {
      stdio: "inherit",
    });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
  process.exit(0);
}

console.error("Neither Supabase CLI nor psql is installed.");
console.error("Apply migration SQL manually in Supabase SQL Editor. Latest files:");
for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort().slice(-3)) {
  console.error(resolve(migrationsDir, file));
}
process.exit(1);
