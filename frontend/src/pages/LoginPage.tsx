import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { collaborationRegistryPath } from "../lib/routes";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

type LocationState = {
  from?: {
    pathname?: string;
  };
};

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (auth.isAuthenticated) {
    return <Navigate replace to={collaborationRegistryPath} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await auth.login(username, password);
      const state = location.state as LocationState | null;
      navigate(state?.from?.pathname ?? collaborationRegistryPath, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="login-panel border-border/70 shadow-sm">
      <CardHeader className="gap-3">
        <p className="eyebrow">Sign in</p>
        <CardTitle className="text-3xl">Access the portal workspace</CardTitle>
        <CardDescription className="text-base leading-7">
          Local development boots with a default admin account so we can move quickly while we build out the full RBAC flow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="login-username">Username</Label>
            <Input id="login-username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="login-password">Password</Label>
            <Input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
