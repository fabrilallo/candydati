import { trimTrailing } from '../text/trim-trailing.js';

/**
 * Minimal XML writing helpers. Everything that comes from data goes through `escapeXml` or `cdata`: there is no other way
 * to put text into a document built here. No DOM and no Node libs (this package runs in the browser and in Node).
 */

/** Characters XML 1.0 forbids (most control characters, U+FFFE, U+FFFF) and lone surrogates are dropped, never escaped. */
// eslint-disable-next-line no-control-regex -- the point of the expression is to match control characters
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export const stripInvalidXmlChars = (value: string): string => value.replace(INVALID_XML_CHARS, '');

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** Text or attribute value. */
export const escapeXml = (value: string): string => stripInvalidXmlChars(value).replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

const CDATA_END = ']]>';

/** A CDATA section; a `]]>` inside the value is split over two sections so it can never close the first one. */
export const cdata = (value: string): string =>
  `<![CDATA[${stripInvalidXmlChars(value).split(CDATA_END).join(']]]]><![CDATA[>')}]]>`;

/** `<name>escaped</name>`; `name` is always a literal of this package, never data. */
export const textElement = (name: string, value: string, indent = ''): string => `${indent}<${name}>${escapeXml(value)}</${name}>`;

export const cdataElement = (name: string, value: string, indent = ''): string => `${indent}<${name}>${cdata(value)}</${name}>`;

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/** Canonical base URL without the trailing slash. */
export const trimBaseUrl = (baseUrl: string): string => trimTrailing(baseUrl, '/');
