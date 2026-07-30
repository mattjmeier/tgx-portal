import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const steps = [
  {
    title: "Create a collaboration",
    description: "Record the owner and shared scientific context.",
  },
  {
    title: "Add a study",
    description: "Define the platform, experimental design, and intake metadata.",
  },
  {
    title: "Review and submit",
    description: "Resolve validation issues and prepare the study for downstream processing.",
  },
] as const;

function storageKey(userId: number) {
  return `tgx-portal:getting-started-dismissed:${userId}`;
}

export function GettingStartedPanel({ userId, onVisibilityChange }: { userId: number; onVisibilityChange: (visible: boolean) => void }) {
  const [isVisible, setIsVisible] = useState(() => localStorage.getItem(storageKey(userId)) !== "true");

  useEffect(() => {
    const visibleForUser = localStorage.getItem(storageKey(userId)) !== "true";
    setIsVisible(visibleForUser);
    onVisibilityChange(visibleForUser);
  }, [onVisibilityChange, userId]);

  function dismiss() {
    localStorage.setItem(storageKey(userId), "true");
    setIsVisible(false);
    onVisibilityChange(false);
  }

  if (!isVisible) {
    return null;
  }

  return (
    <Card className="h-fit border-border/70 shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-3 p-5 pb-4">
        <div className="space-y-1">
          <CardTitle className="text-base">Getting started</CardTitle>
          <p className="text-sm leading-5 text-muted-foreground">A quick path from collaboration context to a review-ready study.</p>
        </div>
        <Button
          aria-label="Dismiss getting started"
          className="-mr-2 -mt-2 text-muted-foreground"
          size="icon"
          type="button"
          variant="ghost"
          onClick={dismiss}
        >
          <X />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 pb-5">
        {steps.map((step, index) => (
          <div className="flex gap-3" key={step.title}>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
              {index + 1}
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-foreground">{step.title}</h2>
              <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{step.description}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
