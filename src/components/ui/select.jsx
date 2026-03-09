"use client"

import * as React from "react"
// React hooks are accessed via React.useState etc. - no separate imports needed
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { Drawer, DrawerContent } from "@/components/ui/drawer"

import { cn } from "@/lib/utils"

// Hook to detect mobile
function useIsMobile() {
  const query = '(max-width: 1023px)';
  const [isMobile, setIsMobile] = React.useState(() => window.matchMedia(query).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

// Context to pass value/onValueChange down to mobile drawer items
const SelectContext = React.createContext(null);

// We wrap the Radix Root to intercept value/onValueChange for mobile
const Select = ({ children, value, onValueChange, defaultValue, ...props }) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);

  if (isMobile) {
    return (
      <SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
        {children}
      </SelectContext.Provider>
    );
  }
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} defaultValue={defaultValue} {...props}>
      {children}
    </SelectPrimitive.Root>
  );
};

const SelectGroup = SelectPrimitive.Group

const SelectValue = React.forwardRef(({ placeholder, ...props }, ref) => {
  const ctx = React.useContext(SelectContext);
  if (ctx) {
    // Mobile: just render value display, handled by Trigger
    return null;
  }
  return <SelectPrimitive.Value ref={ref} placeholder={placeholder} {...props} />;
});
SelectValue.displayName = "SelectValue";

const SelectTrigger = React.forwardRef(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(SelectContext);

  if (ctx) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={() => ctx.setOpen(true)}
        className={cn(
          "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm text-left",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        <span className="line-clamp-1 flex-1">
          {/* Find the label matching current value from children */}
          <SelectValueDisplay>{children}</SelectValueDisplay>
        </span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-1" />
      </button>
    );
  }

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        className
      )}
      {...props}>
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
})
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

// Helper: shows the current value's label on mobile trigger
const SelectValueDisplay = ({ children }) => {
  const ctx = React.useContext(SelectContext);
  if (!ctx) return null;
  // Walk children to find matching SelectItem
  let label = ctx.value || '';
  React.Children.forEach(children, child => {
    if (!child) return;
    // SelectContent passes items
    if (child.type === SelectContent) {
      React.Children.forEach(child.props?.children, item => {
        if (item?.props?.value === ctx.value) {
          label = item.props.children ?? ctx.value;
        }
      });
    }
  });
  return <span className={label ? '' : 'text-muted-foreground'}>{label || ''}</span>;
};

const SelectScrollUpButton = React.forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}>
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}>
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef(({ className, children, position = "popper", ...props }, ref) => {
  const ctx = React.useContext(SelectContext);

  if (ctx) {
    return (
      <Drawer open={ctx.open} onOpenChange={ctx.setOpen}>
        <DrawerContent className="max-h-[70vh]">
          <div className="overflow-y-auto px-2 pb-6 pt-2">
            {React.Children.map(children, child => {
              if (!child) return null;
              // Clone SelectItems to give them the mobile handler
              return React.cloneElement(child, { _mobileCtx: ctx });
            })}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        {...props}>
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn("p-1", position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]")}>
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
})
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-sm font-semibold", className)}
    {...props} />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef(({ className, children, value, _mobileCtx, ...props }, ref) => {
  if (_mobileCtx) {
    const isSelected = _mobileCtx.value === value;
    return (
      <button
        type="button"
        onClick={() => {
          _mobileCtx.onValueChange?.(value);
          _mobileCtx.setOpen(false);
        }}
        className={cn(
          "flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm transition-colors",
          isSelected ? "bg-accent font-medium" : "hover:bg-accent/50"
        )}
      >
        <span>{children}</span>
        {isSelected && <Check className="h-4 w-4 shrink-0" />}
      </button>
    );
  }

  return (
    <SelectPrimitive.Item
      ref={ref}
      value={value}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}>
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
})
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props} />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}