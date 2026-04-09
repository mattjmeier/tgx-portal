import { ChevronRight, CircleHelp } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

type BreadcrumbItem = {
  label: string;
  to?: string;
};

type ActiveContextHeaderProps = {
  badge?: string | null;
  breadcrumbs: BreadcrumbItem[];
  description?: string | null;
  eyebrow: string;
  titleHelp?: string | null;
  title?: string | null;
};

export function ActiveContextHeader({
  badge = null,
  breadcrumbs,
  description = null,
  eyebrow,
  titleHelp = null,
  title = null,
}: ActiveContextHeaderProps) {
  return (
    <div className="min-w-0">
      <p className="text-[0.72rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
      {breadcrumbs.length > 0 ? (
        <nav aria-label="breadcrumb" className="mt-1">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
              <li className="flex items-center gap-1" key={`${crumb.label}-${index}`}>
                {index > 0 ? <ChevronRight className="h-3 w-3" /> : null}
                {crumb.to ? (
                  <Link className="transition-colors hover:text-foreground hover:underline" to={crumb.to}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}>{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {title ? <h1 className="text-xl font-semibold text-foreground md:text-2xl">{title}</h1> : null}
        {titleHelp ? (
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={`More information about ${title}`}
                  className="size-8 shrink-0"
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <CircleHelp />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm text-pretty">
                <p>{titleHelp}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        {badge ? (
          <span className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground">{badge}</span>
        ) : null}
      </div>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
