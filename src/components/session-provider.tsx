"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

export type AuthMode = "oauth" | "keycloak" | null;

interface AuthContextType {
  authenticated: boolean;
  loading: boolean;
  authMode: AuthMode;
  /** Keycloak roles (lockbox:*). Empty for OAuth mode. */
  roles: string[];
  keycloakEnabled: boolean;
  /** OAuth login (paste token). */
  login: (token: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  loading: true,
  authMode: null,
  roles: [],
  keycloakEnabled: false,
  login: async () => ({ ok: false }),
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [keycloakEnabled, setKeycloakEnabled] = useState(false);

  // Load app config (keycloakEnabled flag)
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setKeycloakEnabled(!!data.keycloakEnabled))
      .catch(() => {});
  }, []);

  // Check session on mount
  useEffect(() => {
    (async () => {
      try {
        // Check OAuth session
        const oauthRes = await fetch("/api/auth/oauth");
        const oauthData = await oauthRes.json();

        if (oauthData.authenticated) {
          setAuthenticated(true);
          setAuthMode("oauth");
          setRoles([]);
          setLoading(false);
          return;
        }

        // Check Keycloak session (next-auth)
        const kcRes = await fetch("/api/auth/session");
        if (kcRes.ok) {
          const kcData = await kcRes.json();
          if (kcData?.user) {
            setAuthenticated(true);
            setAuthMode("keycloak");
            setRoles(kcData.user.roles || []);
            setLoading(false);
            return;
          }
        }

        setAuthenticated(false);
        setAuthMode(null);
        setRoles([]);
      } catch {
        setAuthenticated(false);
        setAuthMode(null);
        setRoles([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // OAuth login (paste token)
  const login = useCallback(async (token: string) => {
    try {
      const res = await fetch("/api/auth/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.ok) {
        setAuthenticated(true);
        setAuthMode("oauth");
        return { ok: true };
      }
      return { ok: false, error: data.error };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, []);

  const logout = useCallback(async () => {
    if (authMode === "keycloak") {
      window.location.href = "/api/auth/signout";
      return;
    }
    await fetch("/api/auth/oauth", { method: "DELETE" });
    setAuthenticated(false);
    setAuthMode(null);
    setRoles([]);
  }, [authMode]);

  const contextValue = useMemo(
    () => ({
      authenticated,
      loading,
      authMode,
      roles,
      keycloakEnabled,
      login,
      logout,
    }),
    [authenticated, loading, authMode, roles, keycloakEnabled, login, logout]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
