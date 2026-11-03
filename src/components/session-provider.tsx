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
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_POLICY,
  type ProviderCapabilities,
  type ProviderUiPolicy,
} from "@/lib/provider-ui";

export type AuthMode = "oauth" | "keycloak" | null;

interface AuthContextType {
  authenticated: boolean;
  loading: boolean;
  authMode: AuthMode;
  /** Keycloak roles (lockbox:*). Empty for OAuth mode. */
  roles: string[];
  keycloakEnabled: boolean;
  /** Valid project names from the server registry (LOCKBOX_PROJECTS). */
  projects: string[];
  /** Active secrets provider and what it supports. */
  provider: "yandex" | "huawei" | null;
  capabilities: ProviderCapabilities;
  policy: ProviderUiPolicy;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  loading: true,
  authMode: null,
  roles: [],
  keycloakEnabled: false,
  projects: [],
  provider: null,
  capabilities: DEFAULT_CAPABILITIES,
  policy: DEFAULT_POLICY,
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
  const [projects, setProjects] = useState<string[]>([]);
  const [provider, setProvider] = useState<AuthContextType["provider"]>(null);
  const [capabilities, setCapabilities] = useState<ProviderCapabilities>(DEFAULT_CAPABILITIES);
  const [policy, setPolicy] = useState<ProviderUiPolicy>(DEFAULT_POLICY);

  // Load app config (keycloakEnabled flag, project registry)
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setKeycloakEnabled(!!data.keycloakEnabled);
        setProjects(Array.isArray(data.projects) ? data.projects : []);
        if (data.provider) setProvider(data.provider);
        if (data.capabilities) setCapabilities(data.capabilities);
        if (data.policy) setPolicy(data.policy);
      })
      .catch(() => {});
  }, []);

  // Check session on mount
  useEffect(() => {
    (async () => {
      try {
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

  const logout = useCallback(async () => {
    window.location.href = "/api/auth/signout";
  }, []);

  const contextValue = useMemo(
    () => ({
      authenticated,
      loading,
      authMode,
      roles,
      keycloakEnabled,
      projects,
      provider,
      capabilities,
      policy,
      logout,
    }),
    [
      authenticated,
      loading,
      authMode,
      roles,
      keycloakEnabled,
      projects,
      provider,
      capabilities,
      policy,
      logout,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
