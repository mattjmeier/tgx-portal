import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "./AuthProvider";

export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return <p>Checking your session...</p>;
  }

  if (!auth.isAuthenticated) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  return <Outlet />;
}
