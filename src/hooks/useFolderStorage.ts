"use client";

import { useState, useEffect } from "react";

export function useFolderStorage() {
  const [folderId, setFolderIdState] = useState<string | null>(null);
  const [folderName, setFolderNameState] = useState<string | null>(null);

  useEffect(() => {
    const savedId = localStorage.getItem("selectedFolderId");
    const savedName = localStorage.getItem("selectedFolderName");
    if (savedId) {
      setFolderIdState(savedId);
      setFolderNameState(savedName);
    }
  }, []);

  const setFolder = (id: string, name: string) => {
    setFolderIdState(id);
    setFolderNameState(name);
    localStorage.setItem("selectedFolderId", id);
    localStorage.setItem("selectedFolderName", name);
  };

  return { folderId, folderName, setFolder };
}
