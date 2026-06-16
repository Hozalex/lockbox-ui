"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  cloudId?: string;
}

interface FolderSelectorProps {
  selectedFolderId: string | null;
  selectedFolderName?: string | null;
  onSelect: (folderId: string, folderName: string) => void;
  /** Called once after the first folder load attempt completes. */
  onLoadComplete?: () => void;
  /** Reports the number of accessible folders after each load (null = unknown/error). */
  onFoldersLoaded?: (count: number | null) => void;
}

export function FolderSelector({
  selectedFolderId,
  selectedFolderName,
  onSelect,
  onLoadComplete,
  onFoldersLoaded,
}: FolderSelectorProps) {
  const [clouds, setClouds] = useState<Cloud[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedCloudId, setSelectedCloudId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep onLoadComplete in a ref so it doesn't cause re-runs
  const onLoadCompleteRef = useRef(onLoadComplete);
  useEffect(() => { onLoadCompleteRef.current = onLoadComplete; }, [onLoadComplete]);
  const onFoldersLoadedRef = useRef(onFoldersLoaded);
  useEffect(() => { onFoldersLoadedRef.current = onFoldersLoaded; }, [onFoldersLoaded]);
  const loadCompleteCalledRef = useRef(false);
  const notifyLoaded = useCallback(() => {
    if (!loadCompleteCalledRef.current) {
      loadCompleteCalledRef.current = true;
      onLoadCompleteRef.current?.();
    }
  }, []);

  // Keep onSelect in a ref so loadFolders doesn't go stale
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  const selectedFolderIdRef = useRef(selectedFolderId);
  useEffect(() => { selectedFolderIdRef.current = selectedFolderId; }, [selectedFolderId]);

  // Load clouds on mount
  useEffect(() => {
    let cancelled = false;
    const load = async (retry = 0): Promise<void> => {
      try {
        const r = await fetch("/api/clouds");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        const list: Cloud[] = data.clouds || [];
        setClouds(list);
        if (list.length >= 1) {
          setSelectedCloudId(list[0].id);
        } else {
          // No clouds reachable — nothing to select.
          onFoldersLoadedRef.current?.(0);
          notifyLoaded();
        }
      } catch (e) {
        if (cancelled) return;
        if (retry < 2) {
          await new Promise((res) => setTimeout(res, 1500));
          return load(retry + 1);
        }
        if (!cancelled) {
          setError("Не удалось загрузить список облаков");
          console.error("Failed to load clouds:", e);
          notifyLoaded();
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [notifyLoaded]);

  // Load folders when cloud is selected
  const lastCloudRef = useRef("");
  const loadFolders = useCallback(async (cloudId: string) => {
    setLoading(true);
    setError(null);
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const r = await fetch(`/api/folders?cloudId=${cloudId}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const list: Folder[] = (data.folders || []).sort(
          (a: Folder, b: Folder) => a.name.localeCompare(b.name)
        );
        setFolders(list);
        onFoldersLoadedRef.current?.(list.length);
        if (list.length > 0) {
          const stored = selectedFolderIdRef.current;
          const storedInList = stored ? list.some((f) => f.id === stored) : false;
          if (!storedInList) {
            onSelectRef.current(list[0].id, list[0].name);
          }
        }
        break;
      } catch (e) {
        if (attempt === 2) {
          setError("Не удалось загрузить каталоги");
          console.error("Failed to load folders:", e);
          onFoldersLoadedRef.current?.(null); // unknown — load failed
        } else {
          await new Promise((res) => setTimeout(res, 1500));
        }
      }
    }
    setLoading(false);
    notifyLoaded();
  }, [notifyLoaded]);

  useEffect(() => {
    if (selectedCloudId && selectedCloudId !== lastCloudRef.current) {
      lastCloudRef.current = selectedCloudId;
      loadFolders(selectedCloudId);
    }
  }, [selectedCloudId, loadFolders]);

  const currentFolderInList = selectedFolderId
    ? folders.some((f) => f.id === selectedFolderId)
    : false;

  if (error) {
    return <span className="text-xs text-destructive">{error}</span>;
  }

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
        value={currentFolderInList ? (selectedFolderId ?? "") : ""}
        onValueChange={(val) => {
          const folder = folders.find((f) => f.id === val);
          if (folder) onSelect(folder.id, folder.name);
        }}
        disabled={loading}
      >
        <SelectTrigger className="w-[200px]">
          {!currentFolderInList && selectedFolderName && !loading ? (
            <span className="truncate text-sm">{selectedFolderName}</span>
          ) : (
            <SelectValue
              placeholder={loading ? "Загрузка..." : "Выберите каталог"}
            />
          )}
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
