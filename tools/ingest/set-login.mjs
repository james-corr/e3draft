#!/usr/bin/env node
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ROOT } from "./config.mjs";
import { Session } from "./session.mjs";

/**
 * Put the thefantasyfootballers.com login into config.json.
 *
 * Exists so the password is typed into a prompt rather than a command line:
 * nothing lands in shell history, and it is never echoed to the screen. The
 * login is checked against the site before it is saved, so a typo is caught
 * here rather than at 2am the night before the draft.
 *
 *   node tools/ingest/set-login.mjs
 */

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

/** Same prompt, but the terminal never shows what is typed. */
function askHidden(q) {
  return new Promise((resolve) => {
    const muted = { write: () => {} };
    process.stdout.write(q);
    // Swap readline's output for a sink while the password is being typed.
    const real = rl.output;
    rl.output = muted;
    rl.question("", (answer) => {
      rl.output = real;
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const email = (await ask("thefantasyfootballers.com email: ")).trim();
const password = await askHidden("password (not shown): ");
rl.close();

if (!email || !password) {
  console.error("Both an email and a password are needed. Nothing saved.");
  process.exit(1);
}

process.stdout.write("\nchecking the login against the site ... ");
const session = new Session({ authFile: join(ROOT, ".auth", "ffb-session.json") });
try {
  await session.login({ email, password, force: true });
} catch (err) {
  console.error(`failed.\n\n${err.message}\n\nNothing was saved to config.json.`);
  process.exit(1);
}
console.log("signed in.");

// Being signed in and being able to see the UDK are two different things, and
// they get reported separately so a subscription problem is never mistaken for
// a wrong password. Either way the credentials are worth saving -- they were
// good enough to sign in.
const configPath = join(ROOT, "config.json");
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
config.ffb = { email, password };

const tmp = `${configPath}.tmp`;
writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
renameSync(tmp, configPath);

console.log("saved to config.json (gitignored). Session cached in .auth/.\n");

const season = config.season ?? new Date().getFullYear();
process.stdout.write(`checking ${season} UDK access ... `);
const access = await session.checkUdkAccess(season);
console.log(access.ok ? "ok — rankings are visible." : `no.\n\n  ${access.reason}`);

if (!access.ok) {
  console.log(`
The login is fine and has been saved. What this means is that this account
cannot currently see the ${season} Ultimate Draft Kit — either it has not been
purchased for this season, or "season" in config.json points at the wrong year.
Check which season you have, set it in config.json, and run this again.`);
  process.exit(1);
}

console.log(`
Next:  npm run recon                 # see what the rankings page actually serves
       npm run refresh -- --dry-run  # pull everything, validate, write nothing`);
