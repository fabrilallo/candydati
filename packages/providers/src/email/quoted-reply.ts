const ORIGINAL_MESSAGE = /^\s*-{2,}\s*(original message|messaggio originale|forwarded message|messaggio inoltrato)\s*-{2,}\s*$/i;
const OUTLOOK_RULE = /^\s*_{10,}\s*$/;
const HEADER_FROM = /^\s*\**(from|da|von)\**:\s*\S/i;
const HEADER_SENT = /\b(sent|inviato(?: il)?|date|data)\**:\s*\S/i;
const SIGNATURE_DELIMITER = /^-- ?$/;
const MOBILE_FOOTER = /^\s*(sent from my |sent from outlook|get outlook for |inviato da |scarica outlook per )/i;
const WROTE_START = /^\s*(on|il giorno|il|in data)\s.+/i;
const WROTE_END = /(wrote|ha scritto|scrisse)\s*:\s*$/i;
const ATTRIBUTION_MAX_LINES = 3;

function isWroteAttribution(lines: readonly string[], index: number): boolean {
  if (!WROTE_START.test(lines[index] ?? '')) return false;
  for (let span = 1; span <= ATTRIBUTION_MAX_LINES; span += 1) {
    const joined = lines.slice(index, index + span).join(' ');
    if (WROTE_END.test(joined)) return true;
  }
  return false;
}

function isHeaderBlock(lines: readonly string[], index: number): boolean {
  if (!HEADER_FROM.test(lines[index] ?? '')) return false;
  const window = lines.slice(index, index + 5).join('\n');
  return HEADER_SENT.test(window);
}

function isCutLine(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? '';
  if (ORIGINAL_MESSAGE.test(line) || SIGNATURE_DELIMITER.test(line) || MOBILE_FOOTER.test(line)) return true;
  if (OUTLOOK_RULE.test(line)) return isHeaderBlock(lines, index + 1);
  return isWroteAttribution(lines, index) || isHeaderBlock(lines, index);
}

/**
 * Keeps the new text of an email reply: removes quoted history (Gmail, Outlook, Apple Mail, Italian and English
 * attributions, `>` lines) and what follows a signature delimiter. Falls back to the whole text when nothing is left.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const cut = lines.findIndex((_, index) => isCutLine(lines, index));
  const head = cut === -1 ? lines : lines.slice(0, cut);
  const kept = head.filter((line) => !line.trimStart().startsWith('>')).join('\n').trim();
  return kept === '' ? text.trim() : kept;
}
