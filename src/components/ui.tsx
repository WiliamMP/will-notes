import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Tooltip } from "radix-ui";

// cva: one place for button styles; each `variant`/`size` combo becomes a set of Tailwind classes
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
  {
    variants: {
      variant: {
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        danger: "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        outline: "border border-input hover:bg-muted",
      },
      size: {
        icon: "size-8",
        md: "h-8 px-3",
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

/** Icon-only button with a tooltip; `label` is both the tooltip text and the screen-reader name */
export function IconButton({ label, ...props }: ButtonProps & { label: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <Button size="icon" aria-label={label} {...props} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="z-50 rounded-md bg-foreground px-2 py-1 text-xs text-background animate-in fade-in-0 zoom-in-95"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
