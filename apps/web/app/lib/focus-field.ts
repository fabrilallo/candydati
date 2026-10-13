/** Scrolls to a form control by id and moves keyboard focus there. Returns false when it is not on the page. */
export const focusField = (id: string, doc: Document = document): boolean => {
  const element = doc.getElementById(id)
  if (!element) return false
  element.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  element.focus({ preventScroll: true })
  return true
}
