import { ChevronRight } from "lucide-react";

type ActiveContextHeaderProps = {
  badge?: string | null;
  breadcrumbs: string[];
  description: string;
  eyebrow: string;
  title: string;
};

export function ActiveContextHeader({
  badge = null,
  breadcrumbs,
  description,
  eyebrow,
  title,
}: ActiveContextHeaderProps) {
  return (
    <div className="min-w-0">
      <p className="text-[0.72rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {breadcrumbs.map((crumb, index) => (
          <div className="flex items-center gap-1" key={`${crumb}-${index}`}>
            {index > 0 ? <ChevronRight className="h-3 w-3" /> : null}
            <span>{crumb}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-foreground md:text-2xl">{title}</h1>
        {badge ? (
          <span className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground">{badge}</span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
