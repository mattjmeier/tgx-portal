import { createContext, useContext, useEffect, useState } from "react";

import { fetchCurrentUser, loginUser, logoutUser, type AuthenticatedUser } from "../api/auth";
import { getStoredAuthToken, setStoredAuthToken } from "../api/http";

type AuthContextValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  user: AuthenticatedUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(getStoredAuthToken());
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function hydrateAuthState() {
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const currentUser = await fetchCurrentUser(token);
        setUser(currentUser);
      } catch {
        setStoredAuthToken(null);
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    void hydrateAuthState();
  }, [token]);

  async function login(username: string, password: string) {
    const response = await loginUser(username, password);
    setStoredAuthToken(response.token);
    setToken(response.token);
    setUser(response.user);
  }

  async function logout() {
    if (token) {
      await logoutUser(token);
    }
    setStoredAuthToken(null);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated: Boolean(token && user),
        token,
        user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
}
