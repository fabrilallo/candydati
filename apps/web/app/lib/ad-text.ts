export type Params = Readonly<Record<string, string | number>>

/**
 * Translator bound to a language, independent of the visitor's locale: a public ad reads in the language it was
 * written in. Built by `useAdTranslate` (vue-i18n with an explicit locale); pure code only receives the function.
 * A `count` param selects singular/plural (`a | b`).
 */
export type Translate = (key: string, params?: Params) => string
