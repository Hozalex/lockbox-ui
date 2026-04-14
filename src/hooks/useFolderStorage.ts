"use client";

import { useState } from "react";

function readStorage() {
  if (typeof window === "undefined") return { id: null, name: null };
  return {
    id: localStorage.getItem("selectedFolderId"),
    name: localStorage.getItem("selectedFolderName"),
  };
}

export function useFolderStorage() {
  const [folderId, setFolderIdState] = useState<string | null>(
    () => readStorage().id
  );
  const [folderName, setFolderNameState] = useState<string | null>(
    () => readStorage().name
  );

  const setFolder = (id: string, name: string) => {
    setFolderIdState(id);
    setFolderNameState(name);
    localStorage.setItem("selectedFolderId", id);
    localStorage.setItem("selectedFolderName", name);
  };

  return { folderId, folderName, setFolder };
}
