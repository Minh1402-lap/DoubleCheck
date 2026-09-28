const hidden: Record<string, string> = {
  "\u200B": "ZERO WIDTH SPACE", "\u200C": "ZERO WIDTH NON-JOINER", "\u200D": "ZERO WIDTH JOINER",
  "\u2060": "WORD JOINER", "\u202A": "LEFT-TO-RIGHT EMBEDDING", "\u202B": "RIGHT-TO-LEFT EMBEDDING",
  "\u202D": "LEFT-TO-RIGHT OVERRIDE", "\u202E": "RIGHT-TO-LEFT OVERRIDE", "\u202C": "POP DIRECTIONAL FORMATTING",
  "\u2066": "LEFT-TO-RIGHT ISOLATE", "\u2067": "RIGHT-TO-LEFT ISOLATE", "\u2068": "FIRST STRONG ISOLATE", "\u2069": "POP DIRECTIONAL ISOLATE"
};

export type UnicodeSignal = { index: number; line: number; codePoint: string; name: string };

export function inspectUnicode(value: string): UnicodeSignal[] {
  const findings: UnicodeSignal[] = [];
  let line = 1;
  Array.from(value).forEach((char, index) => {
    if (char === "\n") line++;
    if (hidden[char]) findings.push({ index, line, codePoint: `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`, name: hidden[char] });
  });
  return findings;
}

export function safeVisibleText(value: string): string {
  return Array.from(value).map((char) => hidden[char] ? `⟦${hidden[char]}⟧` : char).join("");
}
