"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { FolderSelector } from "@/components/folder-selector";

interface HeaderProps {
  folderId: string | null;
  onFolderChange: (folderId: string, folderName: string) => void;
}

export function Header({ folderId, onFolderChange }: HeaderProps) {
  const { authenticated, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Lockbox UI</h1>
          {authenticated && (
            <FolderSelector
              selectedFolderId={folderId}
              onSelect={onFolderChange}
            />
          )}
        </div>
        {authenticated && (
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Выйти
          </Button>
        )}
      </div>
    </header>
  );
}
