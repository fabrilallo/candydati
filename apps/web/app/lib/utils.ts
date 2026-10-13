import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind class merge used by every component (shadcn convention). */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
