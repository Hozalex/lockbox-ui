"use client";

import { useState, useCallback } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useFolderStorage } from "@/hooks/useFolderStorage";
import { useCanWrite } from "@/hooks/useFolderAccess";
import { Header } from "@/components/header";
import { SecretsTable } from "@/components/secrets-table";
import { SecretCreateDialog } from "@/components/secret-create-dialog";
import { PageLoader } from "@/components/page-loader";

export default function SecretsPage() {
  const { authenticated, loading } = useRequireAuth();
  const { folderId, folderName, setFolder } = useFolderStorage();
  const canWrite = useCanWrite(folderName);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Don't render secrets until the folder selector has finished its first load.
  // This prevents SecretsTable from firing API calls with a stale/wrong folderId
  // before the selector can auto-switch to the correct folder (e.g. for Keycloak users).
  const [folderSelectorLoaded, setFolderSelectorLoaded] = useState(false);
  const handleFolderSelectorLoaded = useCallback(() => {
    setFolderSelectorLoaded(true);
  }, []);

  const handleFolderChange = (id: string, name: string) => {
    setFolder(id, name);
  };

  if (loading || !authenticated) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen">
      <Header
        folderId={folderId}
        folderName={folderName}
        onFolderChange={handleFolderChange}
        onFolderSelectorLoaded={handleFolderSelectorLoaded}
      />
      <main className="container mx-auto px-4 py-6">
        {!folderSelectorLoaded ? (
          // Folder selector is still loading — show skeleton to avoid stale API calls
          <PageLoader hideHeader />
        ) : folderId ? (
          <>
            <SecretsTable
              key={`${folderId}-${refreshKey}`}
              folderId={folderId}
              canWrite={canWrite}
              onCreateClick={() => setShowCreateDialog(true)}
            />
            {canWrite && (
              <SecretCreateDialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
                folderId={folderId}
                onSuccess={() => {
                  setShowCreateDialog(false);
                  setRefreshKey((k) => k + 1);
                }}
              />
            )}
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
