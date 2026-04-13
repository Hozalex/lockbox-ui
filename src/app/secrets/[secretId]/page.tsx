"use client";

import { useRouter, useParams } from "next/navigation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useFolderStorage } from "@/hooks/useFolderStorage";
import { useCanWrite } from "@/hooks/useFolderAccess";
import { Header } from "@/components/header";
import { SecretDetail } from "@/components/secret-detail";
import { PageLoader } from "@/components/page-loader";

export default function SecretPage() {
  const { authenticated, loading } = useRequireAuth();
  const router = useRouter();
  const params = useParams();
  const secretId = params.secretId as string;
  const { folderId, folderName, setFolder } = useFolderStorage();
  const canWrite = useCanWrite(folderName);

  const handleFolderChange = (id: string, name: string) => {
    setFolder(id, name);
    router.push("/secrets");
  };

  if (loading || !authenticated) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen">
      <Header folderId={folderId} onFolderChange={handleFolderChange} />
      <main className="container mx-auto px-4 py-6">
        <SecretDetail secretId={secretId} canWrite={canWrite} />
      </main>
    </div>
  );
}
