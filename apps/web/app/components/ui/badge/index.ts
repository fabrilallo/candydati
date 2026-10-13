import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Badge } from "./Badge.vue"

/**
 * Pills (`rounded-full`). Soft backgrounds only; state colours (success, warning, destructive) only for state.
 * `default` is the cobalt tint for selection-like emphasis; `secondary` is the neutral pill (roles, drafts).
 */
export const badgeVariants = cva(
  "inline-flex h-6 items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-medium leading-none w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 [&>svg]:pointer-events-none focus-visible:ring-3 focus-visible:ring-ring/35 transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-accent text-accent-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        outline:
          "border-border bg-transparent text-muted-foreground",
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
