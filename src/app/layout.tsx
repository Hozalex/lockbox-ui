import type { Metadata } from "next";
import { AuthProvider } from "@/components/session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BuildVersion } from "@/components/build-version";
import "./globals.css";

export const metadata: Metadata = {
  title: "YC Lockbox UI",
  description: "Yandex Cloud Lockbox secrets management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
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
