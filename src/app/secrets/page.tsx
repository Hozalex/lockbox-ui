"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useAuth } from "@/components/session-provider";
import { Header } from "@/components/header";
import { SecretsTable } from "@/components/secrets-table";
import { SecretCreateDialog } from "@/components/secret-create-dialog";

export default function SecretsPage() {
  const { authenticated, loading } = useAuth();
  const router = useRouter();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!loading && !authenticated) {
      router.push("/login");
    }
  }, [loading, authenticated, router]);

  useEffect(() => {
    const saved = localStorage.getItem("selectedFolderId");
    if (saved) {
      setFolderId(saved);
    }
  }, []);

  const handleFolderChange = (id: string, name: string) => {
    setFolderId(id);
    localStorage.setItem("selectedFolderId", id);
    localStorage.setItem("selectedFolderName", name);
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
        {folderId ? (
          <>
            <SecretsTable
              key={`${folderId}-${refreshKey}`}
              folderId={folderId}
              onCreateClick={() => setShowCreateDialog(true)}
            />
            <SecretCreateDialog
              open={showCreateDialog}
              onOpenChange={setShowCreateDialog}
              folderId={folderId}
              onSuccess={() => {
                setShowCreateDialog(false);
                setRefreshKey((k) => k + 1);
              }}
            />
          </>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            Выберите каталог для просмотра секретов
          </div>
        )}
      </main>
    </div>
  );
}
