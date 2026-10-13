const ANGLE = /<([^<>]+)>/;

/** `Name <a@b.c>` -> `a@b.c`; plain addresses are trimmed. Case is preserved. */
export function bareAddress(value: string): string {
  const match = ANGLE.exec(value);
  return (match?.[1] ?? value).trim();
}
