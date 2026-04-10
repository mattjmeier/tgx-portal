import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

type WorkspaceSectionCardProps = {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
};

export function WorkspaceSectionCard({
  eyebrow,
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  headerClassName,
}: WorkspaceSectionCardProps) {
  return (
    <Card className={className}>
      <CardHeader className={cn("gap-4", headerClassName)}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">{eyebrow}</p>
            <CardTitle className="text-xl">{title}</CardTitle>
            {description ? <CardDescription className="mt-2 text-sm leading-6">{description}</CardDescription> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}
