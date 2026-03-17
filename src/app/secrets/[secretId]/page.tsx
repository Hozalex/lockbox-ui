"use client";

import { useRouter, useParams } from "next/navigation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useFolderStorage } from "@/hooks/useFolderStorage";
import { Header } from "@/components/header";
import { SecretDetail } from "@/components/secret-detail";

export default function SecretPage() {
  const { authenticated, loading } = useRequireAuth();
  const router = useRouter();
  const params = useParams();
  const secretId = params.secretId as string;
  const { folderId, setFolder } = useFolderStorage();

  const handleFolderChange = (id: string, name: string) => {
    setFolder(id, name);
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
