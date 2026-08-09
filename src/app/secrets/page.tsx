"use client";

import { useState, useCallback } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useFolderStorage } from "@/hooks/useFolderStorage";
import { useFolderAccess, useWritableProjects } from "@/hooks/useFolderAccess";
import { useAuth } from "@/components/session-provider";
import { isAdmin } from "@/lib/rbac";
import { Header } from "@/components/header";
import { SecretsTable } from "@/components/secrets-table";
import { SecretCreateDialog } from "@/components/secret-create-dialog";
import { PageLoader } from "@/components/page-loader";

export default function SecretsPage() {
  const { authenticated, loading } = useRequireAuth();
  const { authMode, projects, roles } = useAuth();
  const { folderId, folderName, setFolder } = useFolderStorage();
  const folderAccess = useFolderAccess(folderName);
  const writableProjects = useWritableProjects(folderName);
  // With no project registry the feature is off: allow creating an unlabeled
  // secret when the user has folder-level write access (back-compat).
  const registryEmpty = projects.length === 0;
  const canCreate =
    writableProjects.length > 0 ||
    (registryEmpty && (folderAccess === "full" || folderAccess === "rw"));
  // Admins bypass project RBAC and may create unlabeled secrets, so don't force
  // a project on them.
  const projectRequired =
    authMode === "keycloak" && !registryEmpty && !isAdmin(roles);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createProject, setCreateProject] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Don't render secrets until the folder selector has finished its first load.
  // This prevents SecretsTable from firing API calls with a stale/wrong folderId
  // before the selector can auto-switch to the correct folder (e.g. for Keycloak users).
  const [folderSelectorLoaded, setFolderSelectorLoaded] = useState(false);
  const handleFolderSelectorLoaded = useCallback(() => {
    setFolderSelectorLoaded(true);
  }, []);

  // Number of folders the user can actually reach (null = unknown / load error).
  const [folderCount, setFolderCount] = useState<number | null>(null);
  const handleFoldersLoaded = useCallback((count: number | null) => {
    setFolderCount(count);
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
        onFoldersLoaded={handleFoldersLoaded}
      />
      <main className="container mx-auto px-4 py-6">
        {!folderSelectorLoaded ? (
          // Folder selector is still loading — show skeleton to avoid stale API calls
          <PageLoader hideHeader />
        ) : folderCount === 0 ? (
          // Authenticated but no folder/project is accessible — explain why
          // (takes precedence over any stale folder id in localStorage).
          <div className="mx-auto max-w-xl py-16 text-center">
            <h2 className="text-lg font-semibold">No access</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {authMode === "keycloak"
                ? "You don't have access to any folder or project. Ask an administrator to grant you a role such as lockbox:<folder>:<project>:ro|rw (or lockbox:<folder>:ro|rw for a whole folder)."
                : "No folders are available for your account. Make sure your Yandex Cloud token has access to a folder in this cloud."}
            </p>
          </div>
        ) : folderId ? (
          <>
            <SecretsTable
              key={`${folderId}-${refreshKey}`}
              folderId={folderId}
              folderName={folderName}
              onCreateClick={(project) => {
                setCreateProject(project);
                setShowCreateDialog(true);
              }}
            />
            {canCreate && (
              <SecretCreateDialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
                folderId={folderId}
                writableProjects={writableProjects}
                presetProject={createProject}
                projectRequired={projectRequired}
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
