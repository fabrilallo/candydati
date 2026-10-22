import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/** Our theme's extra shadows (`app/assets/css/tailwind.css`): without them `shadow-hard` would read as a shadow colour. */
const twMerge = extendTailwindMerge({ extend: { theme: { shadow: ['hard', 'hard-md', 'hard-lg'] } } })

/** Tailwind class merge used by every component (shadcn convention). */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
