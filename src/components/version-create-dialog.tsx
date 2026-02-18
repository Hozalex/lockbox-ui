"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PayloadEntry } from "@/lib/types";

interface KeyValue {
  key: string;
  value: string;
  isNew?: boolean;
  removed?: boolean;
}

interface VersionCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secretId: string;
  currentEntries: PayloadEntry[];
  currentVersionId: string;
  onConflict: () => void;
  onSuccess: () => void;
}

export function VersionCreateDialog({
  open,
  onOpenChange,
  secretId,
  currentEntries,
  currentVersionId,
  onConflict,
  onSuccess,
}: VersionCreateDialogProps) {
  const [description, setDescription] = useState("");
  const [entries, setEntries] = useState<KeyValue[]>([]);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEntries(
        currentEntries.map((e) => ({
          key: e.key,
          value: e.textValue || e.binaryValue || "",
          isNew: false,
          removed: false,
        }))
      );
      setDescription("");
      setJsonInput("");
      setError(null);
    }
  }, [open, currentEntries]);

  const KEY_REGEX = /^[a-zA-Z0-9_.\-]+$/;

  const addEntry = () =>
    setEntries([...entries, { key: "", value: "", isNew: true }]);

  const toggleRemove = (i: number) =>
    setEntries(
      entries.map((e, idx) =>
        idx === i ? { ...e, removed: !e.removed } : e
      )
    );

  const updateEntry = (i: number, field: "key" | "value", val: string) =>
    setEntries(
      entries.map((e, idx) => (idx === i ? { ...e, [field]: val } : e))
    );

  const validateKeys = (keys: string[]): string | null => {
    for (const k of keys) {
      if (!KEY_REGEX.test(k)) {
        return `Невалидный ключ «${k}»: допустимы только латиница, цифры, _, -, .`;
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);

    // payloadEntries describes changes to the base (current) version:
    //  - { key, textValue } — add or update a key
    //  - { key } (no value) — remove a key from the version
    let payloadEntries: { key: string; textValue?: string }[] = [];

    if (jsonMode) {
      try {
        const parsed = JSON.parse(jsonInput);
        // In JSON mode, merge with existing (non-removed) entries
        const existing = entries
          .filter((e) => !e.removed)
          .map((e) => ({ key: e.key, textValue: e.value }));

        const newFromJson = Object.entries(parsed).map(([k, v]) => ({
          key: k,
          textValue: String(v),
        }));

        // Merge: JSON values override existing ones with same key
        const merged = new Map<string, string>();
        for (const e of existing) merged.set(e.key, e.textValue);
        for (const e of newFromJson) merged.set(e.key, e.textValue);

        payloadEntries = Array.from(merged.entries()).map(([k, v]) => ({
          key: k,
          textValue: v,
        }));

        // Entries marked for removal: send key-only (no textValue) to delete
        const removedKeys = entries
          .filter((e) => e.removed && !e.isNew)
          .map((e) => ({ key: e.key }));
        payloadEntries.push(...removedKeys);
      } catch {
        setError("Невалидный JSON");
        setSaving(false);
        return;
      }
    } else {
      // Active entries: add/update
      payloadEntries = entries
        .filter((e) => !e.removed && e.key.trim())
        .map((e) => ({ key: e.key, textValue: e.value }));

      // Removed entries: send key-only (no textValue) to delete from version
      const removedKeys = entries
        .filter((e) => e.removed && !e.isNew && e.key.trim())
        .map((e) => ({ key: e.key }));
      payloadEntries.push(...removedKeys);
    }

    const keyError = validateKeys(payloadEntries.map((e) => e.key));
    if (keyError) {
      setError(keyError);
      setSaving(false);
      return;
    }

    if (payloadEntries.length === 0) {
      setError("Нужна хотя бы одна запись");
      setSaving(false);
      return;
    }

    try {
      // Optimistic lock: check that no one else changed the secret
      const checkRes = await fetch(`/api/secrets/${secretId}`);
      if (checkRes.ok) {
        const fresh = await checkRes.json();
        if (fresh.currentVersion?.id && fresh.currentVersion.id !== currentVersionId) {
          onConflict();
          return;
        }
      }

      const res = await fetch(`/api/secrets/${secretId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description || undefined,
          payloadEntries,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новая версия секрета</DialogTitle>
          <DialogDescription>
            Добавьте, измените или удалите записи
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="versionDescription">Описание версии</Label>
            <Input
              id="versionDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Что изменилось"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Записи</Label>
            <div className="flex gap-2">
              <Button
                variant={jsonMode ? "outline" : "secondary"}
                size="sm"
                onClick={() => setJsonMode(false)}
              >
                Поля
              </Button>
              <Button
                variant={jsonMode ? "secondary" : "outline"}
                size="sm"
                onClick={() => setJsonMode(true)}
              >
                + JSON
              </Button>
            </div>
          </div>

          {/* Existing entries */}
          {entries.map((entry, i) => (
            <div
              key={i}
              className={`flex gap-2 items-center ${entry.removed ? "opacity-40" : ""}`}
            >
              <Input
                placeholder="ключ"
                value={entry.key}
                onChange={(e) => updateEntry(i, "key", e.target.value)}
                className="min-w-[200px] max-w-[400px]"
                disabled={!entry.isNew && !entry.removed}
              />
              <Input
                placeholder="значение"
                value={entry.value}
                onChange={(e) => updateEntry(i, "value", e.target.value)}

                disabled={entry.removed}
              />
              <Button
                variant={entry.removed ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  if (entry.isNew && !entry.removed) {
                    setEntries(entries.filter((_, idx) => idx !== i));
                  } else {
                    toggleRemove(i);
                  }
                }}
                className="shrink-0"
              >
                {entry.removed ? "Вернуть" : "\u00d7"}
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addEntry}>
            + Добавить запись
          </Button>

          {jsonMode && (
            <div>
              <Label>Добавить из JSON (объединяется с записями выше)</Label>
              <Textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder='{"NEW_KEY": "new_value"}'
                rows={4}
                className="font-mono text-sm mt-1"
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Сохранение..." : "Создать версию"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
