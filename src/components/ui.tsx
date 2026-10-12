import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { AlertDialog, Tooltip } from "radix-ui";

// cva: one place for button styles; each `variant`/`size` combo becomes a set of Tailwind classes
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        danger: "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
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

/** Confirmation dialog: open while `title` is set, closes through `onCancel` or after `onConfirm` */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string | null;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog.Root open={title !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40 animate-in fade-in-0" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-80 -translate-1/2 rounded-lg border bg-popover p-5 text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95">
          <AlertDialog.Title className="font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-1 text-muted-foreground">{description}</AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">Cancelar</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="destructive" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
