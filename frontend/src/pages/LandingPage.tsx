import { FlaskConical, PlusCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { GettingStartedPanel } from "../components/GettingStartedPanel";
import { RecentStudiesPanel } from "../components/RecentStudiesPanel";
import { Button } from "../components/ui/button";
import { collaborationCreatePath, globalStudyCreatePath } from "../lib/routes";

export function LandingPage() {
  const auth = useAuth();
  const [isGettingStartedVisible, setIsGettingStartedVisible] = useState(true);
  const handleGettingStartedVisibility = useCallback((visible: boolean) => {
    setIsGettingStartedVisible(visible);
  }, []);

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6">
      <header className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Study workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create, continue, and review toxicogenomics studies.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={globalStudyCreatePath()}>
              <FlaskConical />
              Create study
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={collaborationCreatePath}>
              <PlusCircle />
              New collaboration
            </Link>
          </Button>
        </div>
      </header>

      <div
        className={
          isGettingStartedVisible
            ? "grid min-w-0 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)] xl:items-start"
            : "grid min-w-0"
        }
      >
        <RecentStudiesPanel />
        {auth.user ? (
          <GettingStartedPanel userId={auth.user.id} onVisibilityChange={handleGettingStartedVisibility} />
        ) : null}
      </div>
    </section>
  );
}
