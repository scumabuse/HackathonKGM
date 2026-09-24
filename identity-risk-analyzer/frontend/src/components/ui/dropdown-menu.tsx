import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as React from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export function DropdownMenuContent({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={6}
        className={cn(
          "z-50 min-w-48 rounded-xl border border-fg/10 bg-popover p-1.5 shadow-2xl animate-in fade-in-0 zoom-in-95",
          className,
        )}
        {...p}
      />
    </DropdownPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition data-[highlighted]:bg-fg/[0.07] [&_svg]:size-4 [&_svg]:text-muted-foreground",
        className,
      )}
      {...p}
    />
  );
}

export function DropdownMenuLabel({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) {
  return <DropdownPrimitive.Label className={cn("px-2.5 pb-1 pt-1.5 text-[11px] uppercase tracking-wider text-muted-foreground", className)} {...p} />;
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <DropdownPrimitive.Separator className={cn("my-1 h-px bg-fg/10", className)} />;
}
