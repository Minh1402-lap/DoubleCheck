import { describe, expect, it, vi } from "vitest";
import { classifyGitHubError, createGitHubClient, withGitHubRetry } from "@/lib/collector/github";

function requestError(status: number, message: string, headers: Record<string, string> = {}) {
  return Object.assign(new Error(message), { status, response: { headers, data: { message } } });
}

describe("GitHub API authentication", () => {
  it("sends an authenticated, versioned DoubleCheck request", async () => {
    let sent: Headers | undefined;
    const requestFetch: typeof fetch = async (input, init) => {
      sent = new Request(input, init).headers;
      return new Response(JSON.stringify({ resources: {}, rate: { limit: 5000, remaining: 4999, reset: 0, used: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const client = createGitHubClient("test-token", requestFetch);
    await client.request("GET /rate_limit");
    expect(sent?.get("authorization")).toBe("Bearer test-token");
    expect(sent?.get("accept")).toContain("application/vnd.github+json");
    expect(sent?.get("x-github-api-version")).toBe("2022-11-28");
    expect(sent?.get("user-agent")).toContain("DoubleCheck/0.1.0");
  });

  it("fails clearly when the token is missing", () => {
    expect(() => createGitHubClient(" ")).toThrowError(expect.objectContaining({ code: "GITHUB_TOKEN_MISSING" }));
  });

  it("classifies an invalid token", () => {
    expect(classifyGitHubError(requestError(401, "Bad credentials")).code).toBe("GITHUB_TOKEN_INVALID");
  });
});

describe("GitHub API limits and repository errors", () => {
  it("captures primary rate-limit metadata", () => {
    const error = classifyGitHubError(requestError(403, "API rate limit exceeded", { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1790769600" }));
    expect(error.code).toBe("GITHUB_PRIMARY_RATE_LIMIT");
    expect(error.details).toMatchObject({ limit: 5000, remaining: 0, resetAt: new Date(1790769600 * 1000).toISOString() });
  });

  it("retries a secondary rate limit only up to the configured bound", async () => {
    const operation = vi.fn().mockRejectedValue(requestError(403, "You have exceeded a secondary rate limit", { "x-ratelimit-remaining": "4999", "retry-after": "2" }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(withGitHubRetry(operation, sleep, 2)).rejects.toThrowError(expect.objectContaining({ code: "GITHUB_SECONDARY_RATE_LIMIT" }));
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
  });

  it("classifies a repository that cannot be found", () => {
    expect(classifyGitHubError(requestError(404, "Not Found")).code).toBe("GITHUB_REPOSITORY_NOT_FOUND");
  });

  it("does not turn permission denial into an unauthenticated retry", () => {
    expect(classifyGitHubError(requestError(403, "Resource not accessible by personal access token", { "x-ratelimit-remaining": "4999" })).code).toBe("GITHUB_PERMISSION_DENIED");
  });
});
