import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      roles: string[];
    };
    authMode: "keycloak";
  }
}

declare module "next-auth" {
  interface JWT {
    roles?: string[];
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Keycloak({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    jwt({ token, account, profile }) {
      if (account && profile) {
        // Extract roles from Keycloak token
        // Keycloak puts realm roles in realm_access.roles
        // and client roles in resource_access.<clientId>.roles
        const keycloakProfile = profile as Record<string, unknown>;
        const realmAccess = keycloakProfile.realm_access as
          | { roles?: string[] }
          | undefined;
        const resourceAccess = keycloakProfile.resource_access as
          | Record<string, { roles?: string[] }>
          | undefined;

        const roles: string[] = [];

        // Realm roles
        if (realmAccess?.roles) {
          roles.push(...realmAccess.roles);
        }

        // Client roles (if configured as client roles in Keycloak)
        const clientId = process.env.KEYCLOAK_CLIENT_ID;
        if (clientId && resourceAccess?.[clientId]?.roles) {
          roles.push(...resourceAccess[clientId].roles);
        }

        // Keep only lockbox-related roles
        token.roles = roles.filter((r) => r.startsWith("lockbox:"));
      }
      return token;
    },
    session({ session, token }) {
      session.user.roles = (token.roles as string[]) || [];
      session.authMode = "keycloak";
      return session;
    },
  },
});
