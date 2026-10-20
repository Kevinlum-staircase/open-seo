// Runs the alchemy CLI with --experimental-strip-types turned on, so the
// `alchemy` package.json script works on Windows as well as macOS and Linux.
// The old script set NODE_OPTIONS inline (`NAME=value command`), which only
// POSIX shells understand.
// We start alchemy's own JavaScript entry file with the Node that is running
// this script, instead of the alchemy/alchemy.cmd shim: recent Node versions
// refuse to spawn .cmd files without `shell: true`, and a shell would make us
// handle argument quoting per platform.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FLAG = "--experimental-strip-types";

const alchemyDir = fileURLToPath(
  new URL("../node_modules/alchemy/", import.meta.url),
);
const { bin } = JSON.parse(
  readFileSync(path.join(alchemyDir, "package.json"), "utf8"),
);
const entry = path.join(
  alchemyDir,
  typeof bin === "string" ? bin : bin.alchemy,
);

// Keep any NODE_OPTIONS the user already set, without adding the flag twice.
const existing = process.env.NODE_OPTIONS ?? "";
const nodeOptions = existing.split(/\s+/).includes(FLAG)
  ? existing
  : `${existing} ${FLAG}`.trim();

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});

// Exit with alchemy's own code so a failed deploy still shows as failed. A
// child killed by a signal has no code, so report that as a failure too.
child.on("exit", (code) => process.exit(code ?? 1));
