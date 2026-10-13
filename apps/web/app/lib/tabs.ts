import type { Component } from 'vue'

/** One entry of `UnderlineTabs`. */
export interface TabItem<V extends string> {
  readonly value: V
  readonly label: string
  readonly icon?: Component
  /** A real number only; omitted while unknown. */
  readonly count?: number | null
  readonly testId?: string
  readonly countTestId?: string
}

/** One entry of `LinkTabs`: a tab that leads to its own page. */
export interface LinkTab {
  readonly to: string
  readonly label: string
  readonly icon?: Component
  /** A real number only; omitted while unknown. */
  readonly count?: number | null
  readonly testId?: string
}
