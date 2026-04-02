import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";

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
    return <Navigate replace to="/projects" />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await auth.login(username, password);
      const state = location.state as LocationState | null;
      navigate(state?.from?.pathname ?? "/projects", { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="login-panel">
      <div>
        <p className="eyebrow">Sign in</p>
        <h2>Access the portal workspace</h2>
        <p className="body-copy">
          Local development boots with a default admin account so we can move quickly while we build out the full RBAC flow.
        </p>
      </div>
      <form className="detail-form" onSubmit={handleSubmit}>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      </form>
    </section>
  );
}
