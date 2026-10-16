import { htmlToText as domainHtmlToText } from '@candydati/domain';

/**
 * Plain text from HTML, one line per block: the result is stored as text and never rendered as HTML. The tokenizer
 * lives in `@candydati/domain` (shared with the inbound email use case); see there why tags are not stripped with
 * regular expressions.
 */
export const htmlToText = (html: string): string => domainHtmlToText(html, { blockBreak: '\n' });
