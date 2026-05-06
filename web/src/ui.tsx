import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, X } from "lucide-react";
import React, { createContext, useContext, useMemo, useState } from "react";
import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

// ─── Button ──────────────────────────────────────────────────────────────────

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border border-transparent text-sm font-semibold min-h-10 px-3.5 py-2 cursor-pointer transition-all duration-150 ease-in-out disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-0 focus-ring-visible",
  {
    variants: {
      variant: {
        default: "bg-[var(--primary)] text-[var(--primary-foreground)] hover-primary",
        secondary: "bg-[var(--secondary)] border-[var(--border)] text-[var(--secondary-foreground)] hover:bg-[var(--accent)]",
        ghost: "bg-transparent border-[var(--border)] hover:bg-[var(--accent)]",
        danger: "bg-[var(--destructive)] text-[var(--destructive-foreground)] hover-destructive"
      }
    },
    defaultVariants: { variant: "default" }
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className = "", variant, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant }), className)} {...props} />
));
Button.displayName = "Button";

// ─── Badge ───────────────────────────────────────────────────────────────────

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border text-[11px] font-semibold leading-none px-1.5 py-1 uppercase",
  {
    variants: {
      tone: {
        neutral: "bg-[var(--muted)] border-[var(--border)] text-[var(--muted-foreground)]",
        good: "badge-bg-good text-[var(--success)]",
        warn: "badge-bg-warn text-[var(--warning)]",
        bad: "badge-bg-bad text-[var(--destructive)]",
        info: "badge-bg-info text-[var(--info)]",
        blocked: "badge-bg-bad text-[var(--destructive)]"
      }
    },
    defaultVariants: { tone: "neutral" }
  }
);

type BadgeProps = { children: ReactNode } & VariantProps<typeof badgeVariants>;

export const Badge = ({ tone = "neutral", children }: BadgeProps) => (
  <span className={badgeVariants({ tone })}>{children}</span>
);
Badge.displayName = "Badge";

// ─── Input ───────────────────────────────────────────────────────────────────

export const Input = React.forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className = "", ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex w-full min-h-10 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-all duration-150 ease-in-out placeholder:text-[var(--muted-foreground)] disabled:cursor-not-allowed disabled:opacity-50 focus-ring",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

// ─── Card ────────────────────────────────────────────────────────────────────

export const Card = React.forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className = "", ...props }, ref) => (
  <div ref={ref} className={cn("rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)]", className)} {...props} />
));
Card.displayName = "Card";

// ─── Tabs ────────────────────────────────────────────────────────────────────

export const Tabs = TabsPrimitive.Root;
Tabs.displayName = "Tabs";

export const TabsList = React.forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(({ className = "", ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("inline-flex items-center gap-0.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-[3px]", className)}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(({ className = "", ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "rounded-[calc(var(--radius)-3px)] bg-transparent border-0 text-[var(--muted-foreground)] cursor-pointer text-sm font-semibold min-h-[34px] px-3 py-1.5 data-[state=active]:bg-[var(--background)] data-[state=active]:text-[var(--foreground)] data-[state=active]:shadow-tab-active focus-ring-visible",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = TabsPrimitive.Content;
TabsContent.displayName = "TabsContent";

// ─── Sheet ───────────────────────────────────────────────────────────────────

export const Sheet = ({ open, children, onOpenChange }: { open: boolean; children: ReactNode; onOpenChange: (open: boolean) => void }) => (
  <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <AnimatePresence>
      {open && (
        <DialogPrimitive.Portal key="ns-sheet" forceMount>
          <DialogPrimitive.Overlay asChild forceMount>
            <motion.div
              className="fixed inset-0 z-20 bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            />
          </DialogPrimitive.Overlay>
          <DialogPrimitive.Content asChild forceMount>
            <motion.div
              className="fixed right-0 top-0 z-[21] h-full w-[min(92vw,560px)] max-w-[560px] overflow-y-auto border-l border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] p-5 shadow-[var(--shadow)]"
              initial={{ x: "100%", opacity: 0.7 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      )}
    </AnimatePresence>
  </DialogPrimitive.Root>
);
Sheet.displayName = "Sheet";

export const SheetTitle = DialogPrimitive.Title;
SheetTitle.displayName = "SheetTitle";

export const SheetClose = DialogPrimitive.Close;
SheetClose.displayName = "SheetClose";

// ─── Dropdown ────────────────────────────────────────────────────────────────

export const DropdownMenu = ({ trigger, children }: { trigger: ReactNode; children: ReactNode }) => (
  <DropdownMenuPrimitive.Root>
    <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        className="min-w-[180px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] p-1 text-[var(--popover-foreground)] shadow-[var(--shadow)] z-30"
        align="end"
        sideOffset={6}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  </DropdownMenuPrimitive.Root>
);
DropdownMenu.displayName = "DropdownMenu";

export const DropdownItem = React.forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>>((props, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className="rounded-[calc(var(--radius)-4px)] cursor-pointer text-sm outline-0 px-2.5 py-2 data-[highlighted]:bg-[var(--accent)]"
    {...props}
  />
));
DropdownItem.displayName = "DropdownItem";

// ─── Checkbox ────────────────────────────────────────────────────────────────

export const Checkbox = ({
  checked,
  onCheckedChange,
  label
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}) => (
  <CheckboxPrimitive.Root
    aria-label={label}
    checked={checked}
    className="inline-flex items-center justify-center size-5 rounded-[calc(var(--radius)-4px)] border border-[var(--border)] bg-[var(--background)] text-[var(--primary-foreground)] data-[state=checked]:bg-[var(--primary)] data-[state=checked]:text-[var(--primary-foreground)] focus-ring-visible"
    onCheckedChange={(value) => onCheckedChange(value === true)}
  >
    <CheckboxPrimitive.Indicator>
      <Check size={14} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
);
Checkbox.displayName = "Checkbox";

// ─── Select ──────────────────────────────────────────────────────────────────

export const Select = ({
  value,
  onValueChange,
  placeholder,
  children
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  children: ReactNode;
}) => (
  <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
    <SelectPrimitive.Trigger className="inline-flex items-center justify-between gap-2 min-h-10 min-w-[180px] rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] focus-ring">
      <SelectPrimitive.Value placeholder={placeholder} />
      <SelectPrimitive.Icon>
        <ChevronDown size={15} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className="min-w-[180px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] p-1 text-[var(--popover-foreground)] shadow-[var(--shadow)] z-30"
        position="popper"
        sideOffset={6}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
);
Select.displayName = "Select";

export const SelectItem = ({ value, children }: { value: string; children: ReactNode }) => (
  <SelectPrimitive.Item className="rounded-[calc(var(--radius)-4px)] cursor-pointer text-sm outline-0 px-2.5 py-2 data-[highlighted]:bg-[var(--accent)]" value={value}>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
);
SelectItem.displayName = "SelectItem";

// ─── Toast ───────────────────────────────────────────────────────────────────

interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  tone?: "default" | "error";
}

const ToastContext = createContext<{ push: (message: Omit<ToastMessage, "id">) => void } | null>(null);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const value = useMemo(
    () => ({
      push: (message: Omit<ToastMessage, "id">) => {
        const id = Date.now() + Math.random();
        setMessages((items) => [...items, { ...message, id }]);
      }
    }),
    []
  );

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {messages.map((message) => (
          <ToastPrimitive.Root
            className={cn(
              "flex items-start justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] p-3 shadow-[var(--shadow)]",
              message.tone === "error" && "toast-error-border"
            )}
            duration={3600}
            key={message.id}
            onOpenChange={(open) => {
              if (!open) setMessages((items) => items.filter((item) => item.id !== message.id));
            }}
          >
            <div>
              <ToastPrimitive.Title className="text-sm font-semibold">{message.title}</ToastPrimitive.Title>
              {message.description ? (
                <ToastPrimitive.Description className="text-[13px] text-[var(--muted-foreground)] mt-0.5">{message.description}</ToastPrimitive.Description>
              ) : null}
            </div>
            <ToastPrimitive.Close className="bg-transparent border-0 text-[var(--muted-foreground)] cursor-pointer" aria-label="Close notification">
              <X size={14} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-5 right-5 z-40 grid gap-2.5 w-[min(390px,calc(100vw-40px))]" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
};
