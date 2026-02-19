import { execSync } from "child_process";
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

export function getBuildInfo({
  appVersion = "",
  cwd = path.resolve(process.cwd()),
} = {}) {
  const version = String(appVersion || "").trim() || "dev";
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd) || "unknown";
  const commit = runGit(["rev-parse", "--short=12", "HEAD"], cwd) || "unknown";
  const commitDate = runGit(["show", "-s", "--format=%cI", "HEAD"], cwd) || null;
  const dirty =
    runGit(["status", "--porcelain", "--untracked-files=no"], cwd).length > 0;

  const summary = `${version} | ${branch} @ ${commit}${dirty ? " (dirty)" : ""}`;

  return {
    version,
    branch,
    commit,
    commitDate,
    dirty,
    summary,
  };
}
