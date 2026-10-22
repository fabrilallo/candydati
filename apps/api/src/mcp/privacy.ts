/** A candidate as an external agent sees it: id and first name, never the surname (privacy by design). */
export interface McpCandidateRef {
  readonly id: string;
  readonly firstName: string;
}

export function withoutSurname(ref: { readonly id: string; readonly firstName: string } | null): McpCandidateRef | null {
  return ref ? { id: ref.id, firstName: ref.firstName } : null;
}
