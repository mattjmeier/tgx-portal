import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeft } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { Button } from "./button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./sheet";

type SidebarContextValue = {
  isMobile: boolean;
  openMobile: boolean;
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebarContext() {
  const context = React.useContext(SidebarContext);

  if (!context) {
    throw new Error("Sidebar components must be used within SidebarProvider.");
  }

  return context;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  return <SidebarContext.Provider value={{ isMobile, openMobile, setOpenMobile }}>{children}</SidebarContext.Provider>;
}

export function Sidebar({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) {
  const { isMobile, openMobile, setOpenMobile } = useSidebarContext();

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent className="w-[18rem] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-[18rem]" side="left">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Application navigation and workspace hierarchy.</SheetDescription>
          </SheetHeader>
          <div className={cn("flex h-full flex-col", className)}>{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh w-80 shrink-0 self-start border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col",
        className,
      )}
    >
      {children}
    </aside>
  );
}

export function SidebarInset({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex min-h-svh flex-1 flex-col bg-background", className)} {...props}>
      {children}
    </div>
  );
}

export function SidebarTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { setOpenMobile } = useSidebarContext();

  return (
    <Button
      className={className}
      size="icon"
      type="button"
      variant="outline"
      onClick={() => setOpenMobile(true)}
      {...props}
    >
      <PanelLeft data-icon="inline-start" />
      <span className="sr-only">Open navigation</span>
    </Button>
  );
}

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-sidebar-border px-4 py-4", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sidebar-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4", className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-auto border-t border-sidebar-border px-3 py-4", className)} {...props} />;
}

export function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-2 text-[0.7rem] font-medium uppercase tracking-[0.22em] text-sidebar-foreground/55", className)} {...props} />
  );
}

export function SidebarGroupContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("flex min-w-0 flex-col gap-1", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("list-none", className)} {...props} />;
}

const sidebarMenuButtonVariants = cva(
  "group flex w-full items-center gap-3 overflow-hidden rounded-md border border-transparent px-3 py-2 text-left text-sm text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[active=true]:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "",
        outline: "border-sidebar-border/70 bg-background/70 shadow-sm",
      },
      size: {
        default: "min-h-10",
        sm: "min-h-8 px-2.5 py-1.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type SidebarMenuButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    isActive?: boolean;
  };

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ asChild = false, className, isActive = false, size, variant, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return <Comp className={cn(sidebarMenuButtonVariants({ size, variant }), className)} data-active={isActive} ref={ref} {...props} />;
  },
);
SidebarMenuButton.displayName = "SidebarMenuButton";

export function SidebarMenuSub({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("ml-4 flex min-w-0 flex-col gap-1 border-l border-sidebar-border/70 pl-3", className)} {...props} />;
}

export function SidebarMenuSubItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("list-none", className)} {...props} />;
}

type SidebarMenuSubButtonProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  asChild?: boolean;
  isActive?: boolean;
};

export const SidebarMenuSubButton = React.forwardRef<HTMLAnchorElement, SidebarMenuSubButtonProps>(
  ({ asChild = false, className, isActive = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "a";

    return (
      <Comp
        className={cn(
          "flex min-h-9 items-center gap-2 rounded-md px-2.5 text-sm text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
          className,
        )}
        data-active={isActive}
        ref={ref}
        {...props}
      />
    );
  },
);
SidebarMenuSubButton.displayName = "SidebarMenuSubButton";
