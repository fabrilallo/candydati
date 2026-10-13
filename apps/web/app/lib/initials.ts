/** Pure: up to two initials from a display name or email local part. */
export const initials = (name: string): string => {
  // Numbers are not initials: "Acme 27423" is "A", not "A2".
  const words = name.trim().split(/[\s@._-]+/).filter((word) => /^\p{L}/u.test(word))
  const letters = [words[0], words.length > 1 ? words[words.length - 1] : undefined].map((word) => word?.[0]?.toUpperCase() ?? '')
  return letters.join('') || '?'
}
