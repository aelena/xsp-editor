import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(
  cwd: string,
  args: string[],
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

export async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    await git(dirPath, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

export async function gitInit(dirPath: string): Promise<void> {
  await git(dirPath, ["init"]);
}

export interface GitStatusEntry {
  status: string;
  path: string;
}

export async function gitStatus(dirPath: string): Promise<GitStatusEntry[]> {
  try {
    const output = await git(dirPath, ["status", "--porcelain"]);
    if (!output) return [];
    return output.split("\n").map((line) => ({
      status: line.substring(0, 2).trim(),
      path: line.substring(3),
    }));
  } catch {
    return [];
  }
}

export async function gitAdd(dirPath: string, files: string[]): Promise<void> {
  await git(dirPath, ["add", ...files]);
}

export async function gitCommit(
  dirPath: string,
  message: string,
): Promise<string> {
  const output = await git(dirPath, ["commit", "-m", message]);
  return output;
}

export interface GitLogEntry {
  hash: string;
  short_hash: string;
  author: string;
  date: string;
  message: string;
}

export async function gitLog(
  dirPath: string,
  limit = 50,
): Promise<GitLogEntry[]> {
  try {
    const output = await git(dirPath, [
      "log",
      `--max-count=${limit}`,
      "--format=%H|%h|%an|%aI|%s",
    ]);
    if (!output) return [];
    return output.split("\n").map((line) => {
      const [hash, short_hash, author, date, ...msgParts] = line.split("|");
      return { hash, short_hash, author, date, message: msgParts.join("|") };
    });
  } catch {
    return [];
  }
}

export async function gitDiff(
  dirPath: string,
  file?: string,
): Promise<string> {
  try {
    const args = ["diff"];
    if (file) args.push("--", file);
    return await git(dirPath, args);
  } catch {
    return "";
  }
}
