import * as React from "react";

import { cn } from "@/lib/utils";

type TabsContextValue = {
  baseId: string;
  value: string;
  setValue: (nextValue: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

type TabsProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (nextValue: string) => void;
  children: React.ReactNode;
  className?: string;
};

function Tabs({ value, defaultValue, onValueChange, children, className }: TabsProps) {
  const fallbackId = React.useId();
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? "");
  const activeValue = value ?? uncontrolledValue;

  const setValue = React.useCallback(
    (nextValue: string) => {
      if (value === undefined) {
        setUncontrolledValue(nextValue);
      }
      onValueChange?.(nextValue);
    },
    [onValueChange, value],
  );

  const contextValue = React.useMemo<TabsContextValue>(
    () => ({
      baseId: fallbackId,
      value: activeValue,
      setValue,
    }),
    [activeValue, fallbackId, setValue],
  );

  return (
    <TabsContext.Provider value={contextValue}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

type TabsListProps = React.HTMLAttributes<HTMLDivElement>;

function TabsList({ className, ...props }: TabsListProps) {
  return (
    <div
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className,
      )}
      role="tablist"
      {...props}
    />
  );
}

type TabsTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
};

function TabsTrigger({ className, value, type = "button", onClick, onKeyDown, ...props }: TabsTriggerProps) {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("TabsTrigger must be used within Tabs.");
  }

  const isSelected = context.value === value;
  const triggerId = `${context.baseId}-trigger-${value}`;
  const contentId = `${context.baseId}-content-${value}`;

  return (
    <button
      aria-controls={contentId}
      aria-selected={isSelected}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        isSelected ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
        className,
      )}
      data-state={isSelected ? "active" : "inactive"}
      id={triggerId}
      role="tab"
      tabIndex={isSelected ? 0 : -1}
      type={type}
      onClick={(event) => {
        context.setValue(value);
        onClick?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          const tabList = (event.currentTarget.closest('[role="tablist"]') ??
            event.currentTarget.parentElement) as HTMLElement | null;
          const triggers = tabList ? Array.from(tabList.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])')) : [];
          const index = triggers.findIndex((node) => node === event.currentTarget);
          if (index >= 0 && triggers.length > 1) {
            const nextIndex = event.key === "ArrowRight" ? (index + 1) % triggers.length : (index - 1 + triggers.length) % triggers.length;
            triggers[nextIndex]?.focus();
          }
        }
        onKeyDown?.(event);
      }}
      {...props}
    />
  );
}

type TabsContentProps = React.HTMLAttributes<HTMLDivElement> & {
  value: string;
};

function TabsContent({ className, value, ...props }: TabsContentProps) {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("TabsContent must be used within Tabs.");
  }

  const isSelected = context.value === value;
  const triggerId = `${context.baseId}-trigger-${value}`;
  const contentId = `${context.baseId}-content-${value}`;

  return (
    <div
      aria-labelledby={triggerId}
      className={cn("mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)}
      data-state={isSelected ? "active" : "inactive"}
      hidden={!isSelected}
      id={contentId}
      role="tabpanel"
      tabIndex={0}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };

