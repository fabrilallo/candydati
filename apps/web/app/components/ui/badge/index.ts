import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Badge } from "./Badge.vue"

/**
 * Pills (`rounded-full`), semibold. `outline` is the candy pill: white with a 1.5px ink outline. `highlight` is the one
 * yellow pill, for the salary. `default` is the soft yellow tint (agent, selection); `secondary` the neutral pill
 * (roles, drafts). State colours (success, warning, destructive) only for state.
 */
export const badgeVariants = cva(
  "inline-flex h-6 items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-semibold leading-none w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 [&>svg]:pointer-events-none focus-visible:ring-3 focus-visible:ring-ring/35 transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-accent text-accent-foreground",
        highlight:
          "border-[1.5px] border-ink bg-highlight text-highlight-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        outline:
          "border-[1.5px] border-ink bg-card text-foreground",
        success:
          "border-transparent bg-success-soft text-success",
        warning:
          "border-transparent bg-warning-soft text-warning",
        destructive:
          "border-transparent bg-destructive-soft text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)
export type BadgeVariants = VariantProps<typeof badgeVariants>
