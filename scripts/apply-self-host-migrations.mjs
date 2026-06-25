import { spawnSync } from "node:child_process";
import process from "node:process";

const host = process.env.SELF_HOST_SSH_HOST || "81.71.9.118";
const user = process.env.SELF_HOST_SSH_USER || "ubuntu";
const keyPath = process.env.SELF_HOST_SSH_KEY || "~/Desktop/codex.pem";
const rootDir = process.env.SELF_HOST_ROOT_DIR || "/opt/tongpin";

const remote = `${user}@${host}`;
const command = `cd ${shellQuote(rootDir)} && sh scripts/apply-db-migrations.sh`;
const args = [
  "-i",
  keyPath,
  "-o",
  "IdentitiesOnly=yes",
  remote,
  command,
];

console.log(`Applying self-host database migrations on ${remote}:${rootDir}`);
const result = spawnSync("ssh", args, { stdio: "inherit" });
process.exit(result.status ?? 1);

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
