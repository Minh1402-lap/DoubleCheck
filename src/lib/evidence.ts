import { createHash } from "node:crypto";
import type { EvidenceRef } from "./types";
export { redactSecrets } from "./redaction";

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function excerptAt(content: string, start: number, end: number): string | null {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (end > lines.length) return null;
  return lines.slice(start - 1, end).join("\n");
}

export function verifyEvidence(evidence: EvidenceRef, files: Map<string, string>): boolean {
  const content = files.get(evidence.filePath);
  if (content === undefined) return false;
  const actual = excerptAt(content, evidence.lineStart, evidence.lineEnd);
  return actual !== null && actual === evidence.excerpt.replace(/\r\n/g, "\n");
}
