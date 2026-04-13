import { useEffect, useState } from "react";
import { ChevronDown, Minus, X } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

type BannerPreference = "expanded" | "minimized" | "dismissed";

type OnboardingResumeBannerProps = {
  studyId: number;
  title: string;
  description: string;
  actionLabel?: string;
  to: string;
};

function storageKey(studyId: number) {
  return `tgx:onboarding-resume-banner:${studyId}`;
}

function loadPreference(studyId: number): BannerPreference {
  const stored = localStorage.getItem(storageKey(studyId));
  if (stored === "minimized" || stored === "dismissed") {
    return stored;
  }
  return "expanded";
}

export function OnboardingResumeBanner({
  studyId,
  title,
  description,
  actionLabel = "Continue onboarding",
  to,
}: OnboardingResumeBannerProps) {
  const [preference, setPreference] = useState<BannerPreference>(() => loadPreference(studyId));

  useEffect(() => {
    setPreference(loadPreference(studyId));
  }, [studyId]);

  function updatePreference(next: BannerPreference) {
    setPreference(next);
    localStorage.setItem(storageKey(studyId), next);
  }

  if (preference === "dismissed") {
    return null;
  }

  return (
    <Card className="mb-4 border border-amber-200/80 bg-amber-50/70 shadow-sm">
      <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {preference === "expanded" ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Resume the saved draft when you are ready.</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Button asChild size="sm">
            <Link to={to}>{actionLabel === "Continue onboarding" ? "Continue" : actionLabel}</Link>
          </Button>
          {preference === "expanded" ? (
            <Button
              aria-label="Minimize onboarding reminder"
              size="icon"
              type="button"
              variant="outline"
              onClick={() => updatePreference("minimized")}
            >
              <Minus />
            </Button>
          ) : (
            <Button
              aria-label="Expand onboarding reminder"
              size="icon"
              type="button"
              variant="outline"
              onClick={() => updatePreference("expanded")}
            >
              <ChevronDown />
            </Button>
          )}
          <Button
            aria-label="Dismiss onboarding reminder"
            size="icon"
            type="button"
            variant="outline"
            onClick={() => updatePreference("dismissed")}
          >
            <X />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
