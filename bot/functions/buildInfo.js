import { execSync } from "child_process";
import fs from "fs";
import path from "path";

function runGit(args = [], cwd = process.cwd()) {
  try {
    const out = execSync(`git -C "${cwd}" ${args.join(" ")}`, {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1500,
      windowsHide: true,
    });
    return String(out || "").trim();
  } catch {
    return "";
  }
}

function readPackageVersion(cwd = process.cwd()) {
  const candidates = [
    path.resolve(cwd, "package.json"),
    path.resolve(cwd, "..", "package.json"),
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      const version = String(parsed?.version || "").trim();
      if (version) return version;
    } catch {}
  }

  return "";
}

export function getBuildInfo({
  appVersion = "",
  cwd = path.resolve(process.cwd()),
} = {}) {
  const version =
    String(process.env.BOT_VERSION || "").trim() ||
    String(appVersion || "").trim() ||
    readPackageVersion(cwd) ||
    "dev";
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd) || "unknown";
  const commit = runGit(["rev-parse", "--short=12", "HEAD"], cwd) || "unknown";
  const commitCountRaw = runGit(["rev-list", "--count", "HEAD"], cwd);
  const commitCount = Number.isFinite(Number(commitCountRaw))
    ? Math.max(0, Math.floor(Number(commitCountRaw)))
    : null;
  const describe =
    runGit(["describe", "--tags", "--always", "--dirty"], cwd) ||
    `${branch}-${commit}`;
  const commitDate = runGit(["show", "-s", "--format=%cI", "HEAD"], cwd) || null;
  const dirty =
    runGit(["status", "--porcelain", "--untracked-files=no"], cwd).length > 0;

  const summary = `${version} | ${describe} @ ${commit}${dirty ? " (dirty)" : ""}`;

  return {
    version,
    describe,
    branch,
    commit,
    commitCount,
    commitDate,
    dirty,
    summary,
  };
}
