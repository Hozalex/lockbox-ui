"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/session-provider";
import { Header } from "@/components/header";
import { SecretDetail } from "@/components/secret-detail";

export default function SecretPage() {
  const { authenticated, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const secretId = params.secretId as string;

  useEffect(() => {
    if (!loading && !authenticated) {
      router.push("/login");
    }
  }, [loading, authenticated, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Загрузка...
      </div>
    );
  }

  if (!authenticated) return null;

  return (
    <div className="min-h-screen">
      <Header folderId={null} onFolderChange={() => {}} />
      <main className="container mx-auto px-4 py-6">
        <SecretDetail secretId={secretId} />
      </main>
    </div>
  );
}
