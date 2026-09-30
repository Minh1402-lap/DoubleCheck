import { Octokit } from "@octokit/rest";
import { sha256, redactSecrets } from "../evidence";
import { env } from "../env";
import { classifyPath, couldAutoRun } from "./classify";
import { inspectUnicode, safeVisibleText } from "../unicode";

export const LIMITS = { inventory: 2000, files: 400, fileBytes: 250_000, collectedBytes: 8_000_000, selectedBytes: 4_000_000 } as const;
export type CollectedFile = { path: string; size: number; type: string; selected: boolean; skipReason?: string; priorityReasons: string[]; content?: string; hash?: string; unicodeSignals: ReturnType<typeof inspectUnicode> };

export type GitHubErrorCode =
  | "GITHUB_TOKEN_MISSING"
  | "GITHUB_TOKEN_INVALID"
  | "GITHUB_PERMISSION_DENIED"
  | "GITHUB_PRIMARY_RATE_LIMIT"
  | "GITHUB_SECONDARY_RATE_LIMIT"
  | "GITHUB_REPOSITORY_NOT_FOUND"
  | "GITHUB_PRIVATE_REPOSITORY"
  | "GITHUB_API_ERROR";

type GitHubHeaders = Record<string, string | undefined>;
type GitHubRequestError = Error & { status?: number; response?: { headers?: GitHubHeaders; data?: unknown } };

export class GitHubApiError extends Error {
  constructor(
    public readonly code: GitHubErrorCode,
    message: string,
    public readonly details: { status?: number; limit?: number; remaining?: number; resetAt?: string; retryAfterSeconds?: number } = {}
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

function numericHeader(headers: GitHubHeaders, name: string): number | undefined {
  const value = Number(headers[name]);
  return Number.isFinite(value) ? value : undefined;
}

function responseMessage(error: GitHubRequestError): string {
  const data = error.response?.data;
  if (typeof data === "object" && data !== null && "message" in data && typeof data.message === "string") return data.message;
  return error.message;
}

export function classifyGitHubError(error: unknown): GitHubApiError {
  if (error instanceof GitHubApiError) return error;
  const requestError = error as GitHubRequestError;
  const status = typeof requestError?.status === "number" ? requestError.status : undefined;
  const headers = requestError?.response?.headers ?? {};
  const limit = numericHeader(headers, "x-ratelimit-limit");
  const remaining = numericHeader(headers, "x-ratelimit-remaining");
  const resetEpoch = numericHeader(headers, "x-ratelimit-reset");
  const retryAfterSeconds = numericHeader(headers, "retry-after");
  const resetAt = resetEpoch === undefined ? undefined : new Date(resetEpoch * 1000).toISOString();
  const message = responseMessage(requestError).toLowerCase();
  const details = { status, limit, remaining, resetAt, retryAfterSeconds };

  if (status === 401) return new GitHubApiError("GITHUB_TOKEN_INVALID", "GitHub rejected GITHUB_TOKEN. Create a valid token and try again.", details);
  if ((status === 403 || status === 429) && remaining === 0) {
    const reset = resetAt ? ` The limit resets at ${resetAt}.` : "";
    return new GitHubApiError("GITHUB_PRIMARY_RATE_LIMIT", `GitHub's primary API rate limit has been reached.${reset}`, details);
  }
  if ((status === 403 || status === 429) && (retryAfterSeconds !== undefined || message.includes("secondary rate limit") || message.includes("abuse detection"))) {
    return new GitHubApiError("GITHUB_SECONDARY_RATE_LIMIT", "GitHub's secondary API rate limit is active. Retry later.", details);
  }
  if (status === 403) return new GitHubApiError("GITHUB_PERMISSION_DENIED", "GITHUB_TOKEN does not have permission to read this repository.", details);
  if (status === 404) return new GitHubApiError("GITHUB_REPOSITORY_NOT_FOUND", "The repository does not exist, or the token cannot access it if it is private.", details);
  return new GitHubApiError("GITHUB_API_ERROR", "GitHub API could not complete the repository request.", details);
}

export async function withGitHubRetry<T>(operation: () => Promise<T>, sleep: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), maxRetries = 2): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      const classified = classifyGitHubError(error);
      if (classified.code !== "GITHUB_SECONDARY_RATE_LIMIT" || attempt >= maxRetries) throw classified;
      const seconds = Math.min(60, Math.max(1, classified.details.retryAfterSeconds ?? 2 ** attempt));
      await sleep(seconds * 1000);
    }
  }
}

export function createGitHubClient(token: string, requestFetch?: typeof fetch): Octokit {
  const normalized = token.trim();
  if (!normalized) throw new GitHubApiError("GITHUB_TOKEN_MISSING", "GITHUB_TOKEN is required for repository scans. Add a token with read access to repository contents.");
  const client = new Octokit({
    baseUrl: "https://api.github.com",
    userAgent: "DoubleCheck/0.1.0",
    request: {
      timeout: 15_000,
      ...(requestFetch ? { fetch: requestFetch } : {})
    }
  });
  client.hook.before("request", (options) => {
    options.headers.authorization = `Bearer ${normalized}`;
    options.headers.accept = "application/vnd.github+json";
    options.headers["x-github-api-version"] = "2022-11-28";
  });
  return client;
}

export class GitHubCollector {
  private octokit: Octokit;
  constructor(token = env().GITHUB_TOKEN ?? "") { this.octokit = createGitHubClient(token); }

  async collect(owner: string, repo: string, requestedRef?: string) {
    const repository = await withGitHubRetry(() => this.octokit.repos.get({ owner, repo }));
    if (repository.data.private) throw new GitHubApiError("GITHUB_PRIVATE_REPOSITORY", "Private repositories are not supported, even when GITHUB_TOKEN can access them.");
    const ref = requestedRef ?? repository.data.default_branch;
    const commit = await withGitHubRetry(() => this.octokit.repos.getCommit({ owner, repo, ref }));
    const sha = commit.data.sha;
    const tree = await withGitHubRetry(() => this.octokit.git.getTree({ owner, repo, tree_sha: sha, recursive: "true" }));
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
      const blob = await withGitHubRetry(() => this.octokit.git.getBlob({ owner, repo, file_sha: item.entry.sha! }));
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
