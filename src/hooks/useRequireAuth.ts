"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/session-provider";

export function useRequireAuth() {
  const { authenticated, loading, authMode, roles } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !authenticated) {
      router.push("/login");
    }
  }, [loading, authenticated, router]);

  return { authenticated, loading, authMode, roles };
}
