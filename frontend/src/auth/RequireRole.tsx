import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "./AuthProvider";

type RequireRoleProps = {
  allowedRoles: Array<"admin" | "client" | "system">;
};

export function RequireRole({ allowedRoles }: RequireRoleProps) {
  const auth = useAuth();

  if (auth.isLoading) {
    return <p>Checking your permissions...</p>;
  }

  if (!auth.user || !allowedRoles.includes(auth.user.profile.role)) {
    return <Navigate replace to="/projects" />;
  }

  return <Outlet />;
}
