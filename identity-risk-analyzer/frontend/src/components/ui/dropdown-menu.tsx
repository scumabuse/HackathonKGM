import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuRadioGroup = DropdownPrimitive.RadioGroup;

export function DropdownMenuContent({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={6}
        className={cn("z-50 min-w-48 rounded-card bg-overlay p-1 shadow-overlay animate-in fade-in-0 zoom-in-[0.98] duration-fast", className)}
        {...p}
      />
    </DropdownPrimitive.Portal>
  );
}

const itemClass =
  "relative flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-control px-2.5 text-13 text-fg outline-none transition-colors duration-fast data-[highlighted]:bg-fg/[0.06] [&_svg]:size-4 [&_svg]:text-fg-3";

export function DropdownMenuItem({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>) {
  return <DropdownPrimitive.Item className={cn(itemClass, className)} {...p} />;
}

/** Multi-select item (e.g. categories) — the check sits on the right, the label stays in text ink. */
export function DropdownMenuCheckboxItem({ className, children, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.CheckboxItem>) {
  return (
    <DropdownPrimitive.CheckboxItem className={cn(itemClass, "pr-8", className)} onSelect={(e) => e.preventDefault()} {...p}>
      {children}
      <DropdownPrimitive.ItemIndicator className="absolute right-2.5">
        <Check className="!text-fg" />
      </DropdownPrimitive.ItemIndicator>
    </DropdownPrimitive.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({ className, children, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.RadioItem>) {
  return (
    <DropdownPrimitive.RadioItem className={cn(itemClass, "pr-8", className)} {...p}>
      {children}
      <DropdownPrimitive.ItemIndicator className="absolute right-2.5">
        <Check className="!text-fg" />
      </DropdownPrimitive.ItemIndicator>
    </DropdownPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) {
  return <DropdownPrimitive.Label className={cn("eyebrow px-2.5 pb-1 pt-2", className)} {...p} />;
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <DropdownPrimitive.Separator className={cn("mx-1 my-1 h-px bg-line", className)} />;
}
