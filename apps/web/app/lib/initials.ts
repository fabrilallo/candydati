/** Pure: up to two initials from a display name or email local part. */
export const initials = (name: string): string => {
  const words = name.trim().split(/[\s@._-]+/).filter(Boolean)
  const letters = [words[0], words.length > 1 ? words[words.length - 1] : undefined].map((word) => word?.[0]?.toUpperCase() ?? '')
  return letters.join('') || '?'
}
