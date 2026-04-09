import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

type FlashVariant = "success" | "info" | "warning" | "error";

type FlashAction = {
  label: string;
  to: string;
};

type FlashMessage = {
  variant?: FlashVariant;
  title: string;
  description?: string;
  action?: FlashAction;
};

type LocationFlashState = {
  flash?: FlashMessage;
};

function parseFlash(state: unknown): FlashMessage | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const flashCandidate = (state as LocationFlashState).flash;
  if (!flashCandidate || typeof flashCandidate !== "object") {
    return null;
  }

  const title = (flashCandidate as FlashMessage).title;
  if (typeof title !== "string" || title.trim() === "") {
    return null;
  }

  return flashCandidate as FlashMessage;
}

function getVariantClasses(variant: FlashVariant) {
  switch (variant) {
    case "success":
      return "border-emerald-200 bg-emerald-50/70";
    case "warning":
      return "border-amber-200 bg-amber-50/70";
    case "error":
      return "border-rose-200 bg-rose-50/70";
    case "info":
    default:
      return "border-sky-200 bg-sky-50/70";
  }
}

export function FlashBanner() {
  const location = useLocation();
  const navigate = useNavigate();
  const flashFromLocation = useMemo(() => parseFlash(location.state), [location.state]);
  const [flash, setFlash] = useState<FlashMessage | null>(() => flashFromLocation);

  useEffect(() => {
    if (!flashFromLocation) {
      return;
    }

    setFlash(flashFromLocation);

    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: null },
    );
  }, [flashFromLocation, location.hash, location.pathname, location.search, navigate]);

  if (!flash) {
    return null;
  }

  const variant: FlashVariant = flash.variant ?? "success";
  const action = flash.action;

  return (
    <Card className={`mb-4 border ${getVariantClasses(variant)}`} role="status" aria-live="polite">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{flash.title}</p>
          {flash.description ? <p className="mt-1 text-sm text-muted-foreground">{flash.description}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {action ? (
            <Button asChild size="sm">
              <Link to={action.to}>{action.label}</Link>
            </Button>
          ) : null}
          <Button size="sm" type="button" variant="ghost" onClick={() => setFlash(null)}>
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

