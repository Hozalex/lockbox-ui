"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FolderSelector } from "@/components/folder-selector";
import { ThemeToggle } from "@/components/theme-toggle";

interface HeaderProps {
  folderId: string | null;
  folderName?: string | null;
  onFolderChange: (folderId: string, folderName: string) => void;
  onFolderSelectorLoaded?: () => void;
}

export function Header({ folderId, folderName, onFolderChange, onFolderSelectorLoaded }: HeaderProps) {
  const { authenticated, authMode, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    if (authMode !== "keycloak") {
      router.push("/login");
    }
  };

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Lockbox UI</h1>
          {authenticated && (
            <FolderSelector
              selectedFolderId={folderId}
              selectedFolderName={folderName}
              onSelect={onFolderChange}
              onLoadComplete={onFolderSelectorLoaded}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          {authenticated && authMode && (
            <Badge variant="outline" className="text-xs">
              {authMode === "keycloak" ? "Keycloak" : "OAuth"}
            </Badge>
          )}
          <ThemeToggle />
          {authenticated && (
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Выйти
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
