"use client";

import { useRouter, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useAuth } from "@/components/session-provider";
import { Header } from "@/components/header";
import { SecretDetail } from "@/components/secret-detail";

export default function SecretPage() {
  const { authenticated, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const secretId = params.secretId as string;
  const [folderId, setFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !authenticated) {
      router.push("/login");
    }
  }, [loading, authenticated, router]);

  useEffect(() => {
    const saved = localStorage.getItem("selectedFolderId");
    if (saved) setFolderId(saved);
  }, []);

  const handleFolderChange = (id: string, name: string) => {
    setFolderId(id);
    localStorage.setItem("selectedFolderId", id);
    localStorage.setItem("selectedFolderName", name);
    router.push("/secrets");
  };

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
      <Header folderId={folderId} onFolderChange={handleFolderChange} />
      <main className="container mx-auto px-4 py-6">
        <SecretDetail secretId={secretId} />
      </main>
    </div>
  );
}
