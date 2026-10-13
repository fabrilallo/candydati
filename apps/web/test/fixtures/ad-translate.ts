import en from '../../i18n/locales/en.json'
import it from '../../i18n/locales/it.json'
import type { Params, Translate } from '~/lib/ad-text'

type Tree = { readonly [key: string]: string | Tree }
const TREES: Readonly<Record<string, Tree>> = { it: it as Tree, en: en as Tree }

const lookup = (tree: Tree, key: string): string | null => {
  const found = key.split('.').reduce<string | Tree | undefined>((node, part) => (typeof node === 'object' ? node[part] : undefined), tree)
  return typeof found === 'string' ? found : null
}

const choose = (text: string, count: number): string => {
  const parts = text.split(' | ')
  if (parts.length === 2) return (count === 1 ? parts[0] : parts[1]) as string
  if (parts.length === 3) return (count === 0 ? parts[0] : count === 1 ? parts[1] : parts[2]) as string
  return text
}

/** Test double of the vue-i18n translator: same message files, same `{name}` and `a | b` syntax, in node. */
export const translatorFor =
  (language: string): Translate =>
  (key: string, params: Params = {}) => {
    const raw = lookup(TREES[language] ?? (it as Tree), key)
    if (raw === null) return key
    const text = typeof params.count === 'number' ? choose(raw, params.count) : raw
    return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
  }
