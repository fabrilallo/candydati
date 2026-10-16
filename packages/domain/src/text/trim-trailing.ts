/**
 * `value` without the trailing characters listed in `chars`. A backwards scan, linear on any input: the regex form
 * (`/[...]+$/`) restarts at every character of a long run that is not at the end and goes quadratic.
 */
export function trimTrailing(value: string, chars: string): string {
  let end = value.length;
  while (end > 0 && chars.includes(value.charAt(end - 1))) end -= 1;
  return end === value.length ? value : value.slice(0, end);
}
