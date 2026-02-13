"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Cloud {
  id: string;
  name: string;
}

interface Folder {
  id: string;
  name: string;
  cloudId: string;
}

interface FolderSelectorProps {
  selectedFolderId: string | null;
  onSelect: (folderId: string, folderName: string) => void;
}

export function FolderSelector({
  selectedFolderId,
  onSelect,
}: FolderSelectorProps) {
  const [clouds, setClouds] = useState<Cloud[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedCloudId, setSelectedCloudId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/clouds")
      .then((r) => r.json())
      .then((data) => {
        const list = data.clouds || [];
        setClouds(list);
        if (list.length === 1) {
          setSelectedCloudId(list[0].id);
        }
      })
      .catch(console.error);
  }, []);

  const loadFolders = useCallback((cloudId: string) => {
    setLoading(true);
    fetch(`/api/folders?cloudId=${cloudId}`)
      .then((r) => r.json())
      .then((data) => setFolders(data.folders || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedCloudId) {
      loadFolders(selectedCloudId);
    }
  }, [selectedCloudId, loadFolders]);

  return (
    <div className="flex items-center gap-2">
      {clouds.length > 1 && (
        <Select value={selectedCloudId} onValueChange={setSelectedCloudId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Облако" />
          </SelectTrigger>
          <SelectContent>
            {clouds.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select
        value={selectedFolderId || ""}
        onValueChange={(val) => {
          const folder = folders.find((f) => f.id === val);
          if (folder) onSelect(folder.id, folder.name);
        }}
        disabled={loading || folders.length === 0}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue
            placeholder={loading ? "Загрузка..." : "Выберите каталог"}
          />
        </SelectTrigger>
        <SelectContent>
          {folders.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
