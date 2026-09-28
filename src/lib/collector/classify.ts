const excluded = /(^|\/)(node_modules|vendor|dist|build|coverage|\.next|\.cache|target)(\/|$)/i;
const binaryExt = new Set(["png","jpg","jpeg","gif","webp","ico","pdf","zip","gz","7z","rar","exe","dll","so","dylib","wasm","class","jar","mp3","mp4","mov","woff","woff2","ttf"]);
const priorityNames = /(^|\/)(readme[^/]*|package\.json|pyproject\.toml|setup\.py|build\.rs|dockerfile[^/]*|compose[^/]*\.(ya?ml)|makefile|\.envrc|\.npmrc|\.yarnrc[^/]*)$/i;
const configSurface = /(^|\/)(\.github\/workflows|\.vscode|\.devcontainer|\.husky|\.idea)(\/|$)/i;
const scriptExt = /\.(js|cjs|mjs|ts|tsx|py|rb|rs|go|java|sh|bash|zsh|ps1|bat|cmd|ya?ml|toml|json)$/i;

export function classifyPath(path: string, size: number, maxFileBytes: number) {
  const ext = path.includes(".") ? path.split(".").pop()!.toLowerCase() : "";
  const reasons: string[] = [];
  if (excluded.test(path)) return { type: "excluded", skip: "excluded_directory", priority: 0, reasons };
  if (binaryExt.has(ext)) return { type: "binary", skip: "binary_type", priority: 0, reasons };
  if (size > maxFileBytes) return { type: "oversized", skip: "file_size_limit", priority: 0, reasons };
  let priority = 10;
  if (priorityNames.test(path)) { priority += 90; reasons.push("manifest_or_documentation"); }
  if (configSurface.test(path)) { priority += 90; reasons.push("automatic_or_configuration_surface"); }
  if (scriptExt.test(path)) { priority += 30; reasons.push("source_or_script"); }
  if (/(install|setup|bootstrap|postinstall|preinstall|hook|task)/i.test(path)) { priority += 50; reasons.push("execution_name"); }
  return { type: ext || "text", skip: null, priority, reasons };
}

export function couldAutoRun(path: string): boolean {
  return priorityNames.test(path) || configSurface.test(path) || /(^|\/)(build\.rs|conftest\.py|setup\.py|\.envrc)$/i.test(path);
}
