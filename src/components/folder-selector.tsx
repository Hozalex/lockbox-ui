"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  selectedFolderName?: string | null;
  onSelect: (folderId: string, folderName: string) => void;
}

export function FolderSelector({
  selectedFolderId,
  selectedFolderName,
  onSelect,
}: FolderSelectorProps) {
  const [clouds, setClouds] = useState<Cloud[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedCloudId, setSelectedCloudId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (retry = 0) => {
      try {
        const r = await fetch("/api/clouds");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        const list = data.clouds || [];
        setClouds(list);
        if (list.length === 1) {
          setSelectedCloudId(list[0].id);
        }
      } catch (e) {
        if (cancelled) return;
        if (retry < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return load(retry + 1);
        }
        console.error("Failed to load clouds:", e);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const loadFolders = useCallback(async (cloudId: string, retry = 0) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/folders?cloudId=${cloudId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const list: Folder[] = (data.folders || []).sort(
        (a: Folder, b: Folder) => a.name.localeCompare(b.name)
      );
      setFolders(list);
      if (!selectedFolderId && list.length > 0) {
        onSelect(list[0].id, list[0].name);
      }
    } catch (e) {
      if (retry < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return loadFolders(cloudId, retry + 1);
      }
      console.error("Failed to load folders:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedFolderId, onSelect]);

  useEffect(() => {
    if (selectedCloudId) {
      loadFolders(selectedCloudId);
    }
  }, [selectedCloudId, loadFolders]);

  // Show a fallback item while folders haven't loaded yet
  const hasFolderInList = useMemo(
    () => folders.some((f) => f.id === selectedFolderId),
    [folders, selectedFolderId]
  );
  const showFallback = !!selectedFolderId && !hasFolderInList && !!selectedFolderName;

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
        disabled={loading || (folders.length === 0 && !showFallback)}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue
            placeholder={loading ? "Загрузка..." : "Выберите каталог"}
          />
        </SelectTrigger>
        <SelectContent>
          {showFallback && (
            <SelectItem value={selectedFolderId!}>
              {selectedFolderName}
            </SelectItem>
          )}
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
