import type { Metadata } from "next";
import { headers } from "next/headers";
import { AuthProvider } from "@/components/session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BuildVersion } from "@/components/build-version";
import "./globals.css";

export const metadata: Metadata = {
  title: "YC Lockbox UI",
  description: "Yandex Cloud Lockbox secrets management",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Nonce is injected by the proxy via x-nonce request header.
  // It must be passed to every inline script, otherwise CSP blocks execution.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Theme detection runs before React hydration to prevent flash */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <AuthProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </AuthProvider>
        <BuildVersion />
      </body>
    </html>
  );
}
