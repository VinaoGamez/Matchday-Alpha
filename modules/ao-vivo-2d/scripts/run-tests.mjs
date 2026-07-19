/**
 * Runner dos testes do módulo AO VIVO 2D.
 * Uso:
 *   node modules/ao-vivo-2d/scripts/run-tests.mjs
 *   AO_VIVO_2D_VARIANT=frozen node modules/ao-vivo-2d/scripts/run-tests.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = (process.argv[2] || process.env.AO_VIVO_2D_VARIANT || "lab").toLowerCase();
const variant = arg === "frozen" ? "frozen" : "lab";
process.env.AO_VIVO_2D_VARIANT = variant;
console.log(`\n[ao-vivo-2d] testes → ${variant}/\n`);

const files = ["match-view-world-tests.mjs", "match-view-play-tests.mjs"];
for (const file of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log(`\n[ao-vivo-2d] OK (${variant})\n`);
