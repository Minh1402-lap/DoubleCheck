import { z } from "zod";

const segment = /^[A-Za-z0-9_.-]+$/;

export type NormalizedGitHubUrl = {
  owner: string;
  repository: string;
  requestedRef?: string;
  normalizedUrl: string;
};

export function normalizeGitHubUrl(input: string): NormalizedGitHubUrl {
  const raw = z.string().trim().min(1).max(500).parse(input);
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Enter a valid HTTPS GitHub repository URL."); }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com")
    throw new Error("Only https://github.com repository URLs are supported.");
  if (url.username || url.password || url.port || url.search || url.hash)
    throw new Error("Credentials, ports, query strings, and fragments are not allowed.");

  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length < 2) throw new Error("The URL must include an owner and repository.");
  const owner = parts[0];
  const repository = parts[1].replace(/\.git$/i, "");
  if (!segment.test(owner) || !segment.test(repository) || repository === "." || repository === "..")
    throw new Error("The owner or repository name is invalid.");

  let requestedRef: string | undefined;
  if (parts.length > 2) {
    if (parts[2] !== "tree" || parts.length < 4) {
      throw new Error("Pull requests, file links, and repository subpaths are not supported.");
    }
    requestedRef = parts.slice(3).join("/");
    if (!requestedRef || requestedRef.length > 255 || /[\u0000-\u001f]/.test(requestedRef))
      throw new Error("The selected ref is invalid.");
  }
  return { owner, repository, requestedRef, normalizedUrl: `https://github.com/${owner}/${repository}` };
}
