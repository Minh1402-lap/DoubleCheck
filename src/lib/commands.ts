import type { EvidenceRef } from "./types";

const commandStarts = /^\s{0,3}(?:(?:\$|>)\s*)?(npm|npx|pnpm|yarn|bun|pip|pip3|python|python3|uv|poetry|cargo|go|docker|git|make|curl|wget|powershell|pwsh)\b/i;
export function extractDocumentedCommands(path: string, content: string): EvidenceRef[] {
  if (!/(readme|docs?\/|\.md$)/i.test(path)) return [];
  return content.replace(/\r\n/g, "\n").split("\n").flatMap((line, index) =>
    commandStarts.test(line) ? [{ filePath: path, lineStart: index + 1, lineEnd: index + 1, excerpt: line }] : []);
}

export function validateQuotedCommand(command: EvidenceRef, files: Map<string, string>): boolean {
  const content = files.get(command.filePath)?.replace(/\r\n/g, "\n").split("\n");
  return !!content && command.lineStart === command.lineEnd && content[command.lineStart - 1] === command.excerpt;
}
