import { Octokit } from "@octokit/rest";
import { sha256, redactSecrets } from "../evidence";
import { env } from "../env";
import { classifyPath, couldAutoRun } from "./classify";
import { inspectUnicode, safeVisibleText } from "../unicode";

export const LIMITS = { inventory: 2000, files: 400, fileBytes: 250_000, collectedBytes: 8_000_000, selectedBytes: 4_000_000 } as const;
export type CollectedFile = { path: string; size: number; type: string; selected: boolean; skipReason?: string; priorityReasons: string[]; content?: string; hash?: string; unicodeSignals: ReturnType<typeof inspectUnicode> };

export class GitHubCollector {
  private octokit: Octokit;
  constructor(token = env().GITHUB_TOKEN) { this.octokit = new Octokit({ auth: token, baseUrl: "https://api.github.com", request: { timeout: 15_000 } }); }

  async collect(owner: string, repo: string, requestedRef?: string) {
    const repository = await this.octokit.repos.get({ owner, repo });
    if (repository.data.private) throw new Error("PRIVATE_REPOSITORY");
    const ref = requestedRef ?? repository.data.default_branch;
    const commit = await this.octokit.repos.getCommit({ owner, repo, ref });
    const sha = commit.data.sha;
    const tree = await this.octokit.git.getTree({ owner, repo, tree_sha: sha, recursive: "true" });
    const entries = tree.data.tree.filter((entry) => entry.type === "blob" && entry.path && typeof entry.size === "number").slice(0, LIMITS.inventory);
    const classified = entries.map((entry) => ({ entry, ...classifyPath(entry.path!, entry.size!, LIMITS.fileBytes) }));
    const candidates = classified.filter((x) => !x.skip).sort((a, b) => b.priority - a.priority || a.entry.path!.localeCompare(b.entry.path!));
    const selected = new Set<string>(); let selectedBytes = 0;
    for (const item of candidates) {
      if (selected.size >= LIMITS.files || selectedBytes + item.entry.size! > LIMITS.selectedBytes) break;
      selected.add(item.entry.path!); selectedBytes += item.entry.size!;
    }

    const files: CollectedFile[] = [];
    for (const item of classified) {
      const path = item.entry.path!;
      if (!selected.has(path)) {
        files.push({ path, size: item.entry.size!, type: item.type, selected: false, skipReason: item.skip ?? "selection_budget", priorityReasons: item.reasons, unicodeSignals: inspectUnicode(path) });
        continue;
      }
      const blob = await this.octokit.git.getBlob({ owner, repo, file_sha: item.entry.sha! });
      if (blob.data.encoding !== "base64") throw new Error("UNSUPPORTED_BLOB_ENCODING");
      const bytes = Buffer.from(blob.data.content.replace(/\n/g, ""), "base64");
      if (bytes.includes(0)) {
        files.push({ path, size: bytes.length, type: "binary", selected: false, skipReason: "nul_byte_binary", priorityReasons: item.reasons, unicodeSignals: inspectUnicode(path) });
        continue;
      }
      const original = bytes.toString("utf8");
      files.push({ path, size: bytes.length, type: item.type, selected: true, priorityReasons: item.reasons, content: redactSecrets(safeVisibleText(original)), hash: sha256(bytes), unicodeSignals: [...inspectUnicode(path), ...inspectUnicode(original)] });
    }
    const unclassified = files.filter((f) => couldAutoRun(f.path) && f.priorityReasons.length === 0).map((f) => f.path);
    const skipped = files.filter((f) => !f.selected);
    return {
      sha, defaultBranch: repository.data.default_branch, requestedRef,
      repository: { name: repository.data.name, fullName: repository.data.full_name, description: repository.data.description, createdAt: repository.data.created_at, updatedAt: repository.data.updated_at, stars: repository.data.stargazers_count, forks: repository.data.forks_count, license: repository.data.license?.spdx_id, archived: repository.data.archived },
      owner: { login: repository.data.owner.login, type: repository.data.owner.type }, files, unclassified,
      coverage: { inventoryTruncated: tree.data.truncated || tree.data.tree.length > LIMITS.inventory, inventoryCount: entries.length, inventoryBytes: entries.reduce((n, e) => n + e.size!, 0), selectedBytes: files.filter((f) => f.selected).reduce((n, f) => n + f.size, 0), skippedCount: skipped.length }
    };
  }
}
