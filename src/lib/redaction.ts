const SAFE_PLACEHOLDERS = new Set(["app", "change-me", "changeme", "example", "password", "placeholder", "secret", "test", "your-secret-here"]);
const secretName = "[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)[A-Z0-9_]*";

function safePlaceholder(value:string){return SAFE_PLACEHOLDERS.has(value.trim().toLowerCase())}

export function redactSecrets(value:string):string{
 return value
  .replace(/(-----BEGIN [A-Z ]+PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]+PRIVATE KEY-----)/g,"$1\n[REDACTED]\n$2")
  .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,"[REDACTED_SECRET]")
  .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g,"[REDACTED_SECRET]")
  .replace(/\bAKIA[0-9A-Z]{16}\b/g,"[REDACTED_SECRET]")
  .replace(new RegExp(`(\\b${secretName}\\s*[:=]\\s*)(["'])([^"'\\r\\n]+)\\2`,"gi"),(_,prefix,quote,secret)=>`${prefix}${quote}${safePlaceholder(secret)?secret:"[REDACTED_SECRET]"}${quote}`)
  .replace(new RegExp(`^(\\s*${secretName}\\s*=\\s*)([^\\s#"']+)(.*)$`,"gim"),(_,prefix,secret,suffix)=>`${prefix}${safePlaceholder(secret)||/^(?:os\.environ|process\.env|getenv\()/i.test(secret)?secret:"[REDACTED_SECRET]"}${suffix}`);
}
