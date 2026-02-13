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

interface KeyValue {
  key: string;
  value: string;
}

interface LabelEntry {
  key: string;
  value: string;
}

interface SecretCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string;
  onSuccess: () => void;
}

export function SecretCreateDialog({
  open,
  onOpenChange,
  folderId,
  onSuccess,
}: SecretCreateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kmsKeyId, setKmsKeyId] = useState("");
  const [deletionProtection, setDeletionProtection] = useState(false);
  const [entries, setEntries] = useState<KeyValue[]>([{ key: "", value: "" }]);
  const [labels, setLabels] = useState<LabelEntry[]>([]);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kmsKeys, setKmsKeys] = useState<
    Array<{ id: string; name: string; description: string; defaultAlgorithm: string }>
  >([]);
  const [kmsLoading, setKmsLoading] = useState(false);
  const [kmsCustom, setKmsCustom] = useState(false);

  useEffect(() => {
    if (open && folderId) {
      setKmsLoading(true);
      fetch(`/api/kms/keys?folderId=${encodeURIComponent(folderId)}`)
        .then((r) => r.json())
        .then((data) => {
          setKmsKeys(data.keys || []);
          // If no keys or error — fallback to manual input
          if (!data.keys?.length) setKmsCustom(true);
        })
        .catch(() => setKmsCustom(true))
        .finally(() => setKmsLoading(false));
    }
  }, [open, folderId]);

  const NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;
  const KEY_REGEX = /^[a-zA-Z0-9_.\-]+$/;

  const addEntry = () => setEntries([...entries, { key: "", value: "" }]);
  const removeEntry = (i: number) =>
    setEntries(entries.filter((_, idx) => idx !== i));
  const updateEntry = (i: number, field: "key" | "value", val: string) =>
    setEntries(entries.map((e, idx) => (idx === i ? { ...e, [field]: val } : e)));

  const addLabel = () => setLabels([...labels, { key: "", value: "" }]);
  const removeLabel = (i: number) =>
    setLabels(labels.filter((_, idx) => idx !== i));
  const updateLabel = (i: number, field: "key" | "value", val: string) =>
    setLabels(labels.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)));

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

    let payloadEntries: { key: string; textValue: string }[] = [];

    if (jsonMode) {
      try {
        const parsed = JSON.parse(jsonInput);
        payloadEntries = Object.entries(parsed).map(([k, v]) => ({
          key: k,
          textValue: String(v),
        }));
      } catch {
        setError("Невалидный JSON");
        setSaving(false);
        return;
      }
    } else {
      payloadEntries = entries
        .filter((e) => e.key.trim())
        .map((e) => ({ key: e.key, textValue: e.value }));
    }

    const keyError = validateKeys(payloadEntries.map((e) => e.key));
    if (keyError) {
      setError(keyError);
      setSaving(false);
      return;
    }

    const labelsMap: Record<string, string> = {};
    labels.forEach((l) => {
      if (l.key.trim()) labelsMap[l.key] = l.value;
    });

    try {
      const res = await fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId,
          name,
          description: description || undefined,
          kmsKeyId: kmsKeyId || undefined,
          deletionProtection,
          versionPayloadEntries:
            payloadEntries.length > 0 ? payloadEntries : undefined,
          labels: Object.keys(labelsMap).length > 0 ? labelsMap : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      // Reset form
      setName("");
      setDescription("");
      setKmsKeyId("");
      setDeletionProtection(false);
      setEntries([{ key: "", value: "" }]);
      setLabels([]);
      setJsonInput("");
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Создать секрет</DialogTitle>
          <DialogDescription>
            Создание нового секрета в каталоге
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Имя *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-secret"
              />
            </div>
            <div>
              <Label htmlFor="kmsKeyId">KMS Key</Label>
              {kmsLoading ? (
                <p className="text-xs text-muted-foreground py-2">Загрузка ключей...</p>
              ) : kmsKeys.length > 0 && !kmsCustom ? (
                <select
                  id="kmsKeyId"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  value={kmsKeyId || ""}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setKmsCustom(true);
                      setKmsKeyId("");
                    } else {
                      setKmsKeyId(e.target.value);
                    }
                  }}
                >
                  <option value="">Не выбран</option>
                  {kmsKeys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name || k.id} ({k.defaultAlgorithm})
                    </option>
                  ))}
                  <option value="__custom__">Ввести вручную...</option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <Input
                    id="kmsKeyId"
                    value={kmsKeyId}
                    onChange={(e) => setKmsKeyId(e.target.value)}
                    placeholder="KMS Key ID (опционально)"
                  />
                  {kmsKeys.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      className="shrink-0"
                      onClick={() => {
                        setKmsCustom(false);
                        setKmsKeyId("");
                      }}
                    >
                      Список
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="description">Описание</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="deletionProtection"
              checked={deletionProtection}
              onChange={(e) => setDeletionProtection(e.target.checked)}
            />
            <Label htmlFor="deletionProtection">Защита от удаления</Label>
          </div>

          <Separator />

          {/* Labels */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Метки</Label>
              <Button variant="outline" size="sm" onClick={addLabel}>
                + Метка
              </Button>
            </div>
            {labels.map((l, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input
                  placeholder="ключ"
                  value={l.key}
                  onChange={(e) => updateLabel(i, "key", e.target.value)}
                  className="w-1/3"
                />
                <Input
                  placeholder="значение"
                  value={l.value}
                  onChange={(e) => updateLabel(i, "value", e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeLabel(i)}
                >
                  &times;
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          {/* Payload entries */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Данные секрета</Label>
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
                  JSON
                </Button>
              </div>
            </div>

            {jsonMode ? (
              <Textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder='{"DB_HOST": "localhost", "DB_PASS": "secret"}'
                rows={6}
                className="font-mono text-sm"
              />
            ) : (
              <>
                {entries.map((entry, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <Input
                      placeholder="ключ"
                      value={entry.key}
                      onChange={(e) => updateEntry(i, "key", e.target.value)}
                      className="w-1/3"
                    />
                    <Input
                      placeholder="значение"
                      value={entry.value}
                      onChange={(e) => updateEntry(i, "value", e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEntry(i)}
                      disabled={entries.length === 1}
                    >
                      &times;
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addEntry}>
                  + Добавить запись
                </Button>
              </>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !name.trim()}>
            {saving ? "Создание..." : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Separator() {
  return <hr className="my-2 border-border" />;
}
