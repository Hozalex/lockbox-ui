"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuthMode } from "@/components/session-provider";

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
  authMode?: AuthMode;
}

/**
 * For Keycloak users: calls /api/my-folders (flat list filtered by roles, no cloud selector).
 * For OAuth users: calls /api/clouds + /api/folders (standard two-step flow).
 */
export function FolderSelector({
  selectedFolderId,
  selectedFolderName,
  onSelect,
  authMode,
}: FolderSelectorProps) {
  const isKeycloak = authMode === "keycloak";

  // ── Keycloak flat-list state ─────────────────────────────────────────────
  const [myFolders, setMyFolders] = useState<Folder[]>([]);

  // ── OAuth two-step state ─────────────────────────────────────────────────
  const [clouds, setClouds] = useState<Cloud[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedCloudId, setSelectedCloudId] = useState<string>("");

  // ── Shared state ─────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Keycloak path ────────────────────────────────────────────────────────
  const loadMyFolders = useCallback(async (retry = 0) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/my-folders");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const list: Folder[] = (data.folders || []).sort(
        (a: Folder, b: Folder) => a.name.localeCompare(b.name)
      );
      setMyFolders(list);

      if (list.length === 0) return;

      // If stored folder is not in the allowed list — auto-switch to first
      const storedIsAllowed = selectedFolderId
        ? list.some((f) => f.id === selectedFolderId)
        : false;
      if (!storedIsAllowed) {
        onSelect(list[0].id, list[0].name);
      }
    } catch (e) {
      if (retry < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return loadMyFolders(retry + 1);
      }
      setError("Не удалось загрузить каталоги");
      console.error("Failed to load my-folders:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedFolderId, onSelect]);

  // ── OAuth path ───────────────────────────────────────────────────────────
  const loadFolders = useCallback(async (cloudId: string, retry = 0) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/folders?cloudId=${cloudId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const list: Folder[] = (data.folders || []).sort(
        (a: Folder, b: Folder) => a.name.localeCompare(b.name)
      );
      setFolders(list);

      if (list.length === 0) return;

      const storedIsAllowed = selectedFolderId
        ? list.some((f) => f.id === selectedFolderId)
        : false;
      if (!storedIsAllowed) {
        onSelect(list[0].id, list[0].name);
      }
    } catch (e) {
      if (retry < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return loadFolders(cloudId, retry + 1);
      }
      setError("Не удалось загрузить каталоги");
      console.error("Failed to load folders:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedFolderId, onSelect]);

  // Load clouds (OAuth only)
  useEffect(() => {
    if (isKeycloak) return;
    let cancelled = false;
    const load = async (retry = 0) => {
      try {
        const r = await fetch("/api/clouds");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        const list: Cloud[] = data.clouds || [];
        setClouds(list);
        if (list.length >= 1) {
          setSelectedCloudId(list[0].id);
        }
      } catch (e) {
        if (cancelled) return;
        if (retry < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return load(retry + 1);
        }
        setError("Не удалось загрузить список облаков");
        console.error("Failed to load clouds:", e);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isKeycloak]);

  // Load my-folders (Keycloak) — trigger when authMode becomes known
  useEffect(() => {
    if (isKeycloak) {
      loadMyFolders();
    }
  }, [isKeycloak, loadMyFolders]);

  // Load folders for selected cloud (OAuth)
  useEffect(() => {
    if (!isKeycloak && selectedCloudId) {
      loadFolders(selectedCloudId);
    }
  }, [isKeycloak, selectedCloudId, loadFolders]);

  // ── Derived display values ───────────────────────────────────────────────
  const activeFolders = isKeycloak ? myFolders : folders;
  const currentFolderInList = selectedFolderId
    ? activeFolders.some((f) => f.id === selectedFolderId)
    : false;
  const selectValue = currentFolderInList ? (selectedFolderId ?? "") : "";

  const placeholder = loading
    ? "Загрузка..."
    : activeFolders.length === 0
      ? selectedFolderName ?? "Нет доступных каталогов"
      : "Выберите каталог";

  if (error) {
    return <span className="text-xs text-destructive">{error}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {/* Cloud selector — OAuth only, when multiple clouds */}
      {!isKeycloak && clouds.length > 1 && (
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
        value={selectValue}
        onValueChange={(val) => {
          const folder = activeFolders.find((f) => f.id === val);
          if (folder) onSelect(folder.id, folder.name);
        }}
        disabled={loading}
      >
        <SelectTrigger className="w-[200px]">
          {/* Show current folder name when the stored ID isn't in the list yet */}
          {!currentFolderInList && selectedFolderName && !loading ? (
            <span className="truncate">{selectedFolderName}</span>
          ) : (
            <SelectValue placeholder={placeholder} />
          )}
        </SelectTrigger>
        <SelectContent>
          {activeFolders.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
