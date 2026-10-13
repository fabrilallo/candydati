/** One step of the breadcrumbs. The last one is the current page and carries no link. */
export interface Crumb {
  readonly label: string
  readonly to?: string
}
