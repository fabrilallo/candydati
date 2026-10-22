import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Button } from "./Button.vue"

/**
 * Controls are 12px (`rounded-md`), semibold. Subtle press, one easing curve, visible focus ring. The primary (ink with
 * paper text) is the one action per view that matters; `highlight` (yellow, ink outline) is reserved for the action
 * the response promise asks for; everything else is outline (white with an ink outline), secondary or ghost.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold select-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-snap active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background aria-invalid:ring-destructive/25 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover",
        highlight:
          "border-[1.5px] border-ink bg-highlight text-highlight-foreground hover:shadow-hard",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30",
        outline:
          "border-[1.5px] border-ink bg-card text-foreground hover:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70 dark:hover:bg-secondary/80",
        ghost:
          "text-foreground hover:bg-muted",
        link: "h-auto px-0 text-link underline-offset-4 hover:text-link-hover hover:underline active:scale-100",
      },
      size: {
        "default": "h-9 px-4 has-[>svg]:px-3.5",
        "xs": "h-7 gap-1 rounded-sm px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        "sm": "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        "lg": "h-11 px-5 text-[0.9375rem] has-[>svg]:px-4",
        "icon": "size-9",
        "icon-xs": "size-7 rounded-sm [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
