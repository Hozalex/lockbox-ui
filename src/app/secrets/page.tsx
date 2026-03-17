"use client";

import { useState } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useFolderStorage } from "@/hooks/useFolderStorage";
import { Header } from "@/components/header";
import { SecretsTable } from "@/components/secrets-table";
import { SecretCreateDialog } from "@/components/secret-create-dialog";

export default function SecretsPage() {
  const { authenticated, loading } = useRequireAuth();
  const { folderId, folderName, setFolder } = useFolderStorage();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleFolderChange = (id: string, name: string) => {
    setFolder(id, name);
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
      <Header folderId={folderId} folderName={folderName} onFolderChange={handleFolderChange} />
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
