"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ValueCell } from "@/components/value-cell";
import { VersionCreateDialog } from "@/components/version-create-dialog";
import { SecretCreateDialog } from "@/components/secret-create-dialog";
import type { Secret, PayloadEntry, SecretVersion } from "@/lib/types";

function isValidSecret(data: unknown): data is Secret {
  return (
    typeof data === "object" &&
    data !== null &&
    "id" in data &&
    typeof (data as Secret).id === "string"
  );
}

interface SecretDetailProps {
  secretId: string;
}

export function SecretDetail({ secretId }: SecretDetailProps) {
  const router = useRouter();
  const [secret, setSecret] = useState<Secret | null>(null);
  const [entries, setEntries] = useState<PayloadEntry[]>([]);
  const [versions, setVersions] = useState<SecretVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showVersionDialog, setShowVersionDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "json">("table");
  const [jsonCopied, setJsonCopied] = useState(false);
  const [conflictDialog, setConflictDialog] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCloneDialog, setShowCloneDialog] = useState(false);

  // Low-level loaders — throw on error (no try/catch), used by loadAll
  const fetchSecret = useCallback(async () => {
    const r = await fetch(`/api/secrets/${secretId}`);
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${r.status}`);
    }
    const data = await r.json();
    if (!isValidSecret(data)) {
      throw new Error("Некорректный ответ API");
    }
    return data;
  }, [secretId]);

  const fetchPayload = useCallback(
    async (versionId?: string) => {
      const qs = versionId ? `?versionId=${versionId}` : "";
      const r = await fetch(`/api/secrets/${secretId}/payload${qs}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    },
    [secretId]
  );

  const fetchVersions = useCallback(async () => {
    const r = await fetch(`/api/secrets/${secretId}/versions`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }, [secretId]);

  // Main loader: secret first, then payload + versions.
  // Retries up to 3 times for eventual consistency (new secrets).
  const loadAll = useCallback(
    async (retry = 0) => {
      setLoading(true);
      setLoadError(null);

      try {
        // 1) Secret must load first — everything depends on it
        const secretData = await fetchSecret();
        setSecret(secretData);

        // 2) Payload + versions in parallel
        const [payloadResult, versionsResult] = await Promise.allSettled([
          fetchPayload(),
          fetchVersions(),
        ]);

        // Handle payload
        if (payloadResult.status === "fulfilled") {
          setEntries(payloadResult.value.entries || []);
          if (payloadResult.value.versionId)
            setSelectedVersionId(payloadResult.value.versionId);
        } else if (retry < 3) {
          // Payload failed — retry once more after delay
          await new Promise((resolve) => setTimeout(resolve, 1500));
          try {
            const pl = await fetchPayload();
            setEntries(pl.entries || []);
            if (pl.versionId) setSelectedVersionId(pl.versionId);
          } catch {
            setEntries([]);
          }
        } else {
          setEntries([]);
        }

        // Handle versions
        if (versionsResult.status === "fulfilled") {
          setVersions(versionsResult.value.versions || []);
        } else {
          setVersions([]);
        }

        setLoadError(null);
      } catch (e) {
        console.error("loadAll error:", e);
        // Secret itself failed — retry for eventual consistency
        if (retry < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return loadAll(retry + 1);
        }
        setSecret(null);
        setLoadError((e as Error).message || "Не удалось загрузить секрет");
      } finally {
        setLoading(false);
      }
    },
    [fetchSecret, fetchPayload, fetchVersions]
  );

  // Convenience wrappers for individual reloads
  const loadPayload = useCallback(
    async (versionId?: string) => {
      try {
        const data = await fetchPayload(versionId);
        setEntries(data.entries || []);
        if (data.versionId) setSelectedVersionId(data.versionId);
      } catch (e) {
        console.error(e);
        setEntries([]);
      }
    },
    [fetchPayload]
  );

  const loadVersions = useCallback(async () => {
    try {
      const data = await fetchVersions();
      setVersions(data.versions || []);
    } catch (e) {
      console.error(e);
      setVersions([]);
    }
  }, [fetchVersions]);

  // Initial load
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/secrets/${secretId}`, { method: "DELETE" });
      router.push("/secrets");
    } catch (e) {
      console.error(e);
      setDeleting(false);
    }
  };

  const handleScheduleDestruction = async (
    versionId: string,
    pendingPeriod?: string
  ) => {
    try {
      await fetch(
        `/api/secrets/${secretId}/versions/${versionId}/destroy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pendingPeriod }),
        }
      );
      loadVersions();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelDestruction = async (versionId: string) => {
    try {
      await fetch(
        `/api/secrets/${secretId}/versions/${versionId}/destroy`,
        { method: "DELETE" }
      );
      loadVersions();
    } catch (e) {
      console.error(e);
    }
  };

  const checkVersionConflict = async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/secrets/${secretId}`);
      if (res.ok) {
        const fresh = await res.json();
        if (
          fresh.currentVersion?.id &&
          secret?.currentVersion?.id &&
          fresh.currentVersion.id !== secret.currentVersion.id
        ) {
          setConflictDialog(true);
          return true;
        }
      }
    } catch {
      // network error — proceed, the actual request will fail
    }
    return false;
  };

  const reloadAll = async () => {
    setConflictDialog(false);
    await loadAll();
  };

  const handleRollback = async (versionId: string) => {
    setRollingBack(versionId);
    try {
      if (await checkVersionConflict()) return;

      // 1. Load payload of the target version
      const payloadRes = await fetch(
        `/api/secrets/${secretId}/payload?versionId=${versionId}`
      );
      const payloadData = await payloadRes.json();
      const versionEntries = payloadData.entries || [];

      if (versionEntries.length === 0) {
        alert("Нет записей в этой версии");
        return;
      }

      // 2. Create a new version with the same data
      const res = await fetch(`/api/secrets/${secretId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: `Откат к версии ${versionId.substring(0, 8)}...`,
          payloadEntries: versionEntries.map((e: { key: string; textValue?: string; binaryValue?: string }) => ({
            key: e.key,
            textValue: e.textValue || e.binaryValue || "",
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || `Ошибка: HTTP ${res.status}`);
        return;
      }

      // 3. Reload everything
      await loadAll();
    } catch (e) {
      console.error(e);
    } finally {
      setRollingBack(null);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Загрузка...
      </div>
    );
  }

  if (!secret) {
    return (
      <div className="py-8 text-center">
        <p className="text-destructive">
          {loadError || "Секрет не найден"}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={reloadAll}
        >
          Повторить
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-2"
            onClick={() => router.push("/secrets")}
          >
            &larr; Назад
          </Button>
          <h2 className="text-2xl font-bold">{secret.name || secret.id}</h2>
          {secret.description && (
            <p className="text-muted-foreground">{secret.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => setShowVersionDialog(true)}
          >
            Новая версия
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCloneDialog(true)}
          >
            Клонировать
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setDeleteConfirmText("");
              setShowDeleteDialog(true);
            }}
            disabled={deleting || secret.deletionProtection}
          >
            {deleting ? "Удаление..." : "Удалить"}
          </Button>
        </div>
      </div>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Информация</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <span className="text-muted-foreground">ID</span>
              <p className="font-mono text-xs">{secret.id}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Статус</span>
              <p>
                <Badge variant="secondary">{secret.status}</Badge>
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Создан</span>
              <p>{new Date(secret.createdAt).toLocaleString("ru-RU")}</p>
            </div>
            {secret.kmsKeyId && (
              <div>
                <span className="text-muted-foreground">KMS Key</span>
                <p className="font-mono text-xs">{secret.kmsKeyId}</p>
              </div>
            )}
          </div>
          {Object.keys(secret.labels || {}).length > 0 && (
            <>
              <Separator className="my-3" />
              <div className="flex flex-wrap gap-1">
                {Object.entries(secret.labels).map(([k, v]) => (
                  <Badge key={k} variant="outline" className="text-xs">
                    {k}={v}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="payload">
        <TabsList>
          <TabsTrigger value="payload">Ключи и значения</TabsTrigger>
          <TabsTrigger value="versions">
            Версии ({versions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payload" className="mt-4">
          {/* Controls row: version selector + view mode toggle */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {versions.length > 1 && (
                <>
                  <span className="text-sm text-muted-foreground">Версия:</span>
                  <select
                    className="rounded border px-2 py-1 text-sm"
                    value={selectedVersionId}
                    onChange={(e) => {
                      setSelectedVersionId(e.target.value);
                      loadPayload(e.target.value);
                    }}
                  >
                    {versions
                      .filter((v) => v.status === "ACTIVE")
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.id.substring(0, 8)}...{" "}
                          ({new Date(v.createdAt).toLocaleDateString("ru-RU")})
                          {v.id === secret.currentVersion?.id ? " (текущая)" : ""}
                        </option>
                      ))}
                  </select>
                </>
              )}
            </div>
            {entries.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === "table" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("table")}
                >
                  Таблица
                </Button>
                <Button
                  variant={viewMode === "json" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("json")}
                >
                  JSON
                </Button>
              </div>
            )}
          </div>

          {entries.length === 0 ? (
            <p className="text-muted-foreground">Нет записей</p>
          ) : viewMode === "json" ? (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="absolute right-3 top-3 z-10"
                onClick={() => {
                  const json = JSON.stringify(
                    Object.fromEntries(
                      entries.map((e) => [e.key, e.textValue || e.binaryValue || ""])
                    ),
                    null,
                    2
                  );
                  navigator.clipboard.writeText(json);
                  setJsonCopied(true);
                  setTimeout(() => setJsonCopied(false), 2000);
                }}
              >
                {jsonCopied ? "Скопировано!" : "Копировать"}
              </Button>
              <pre className="overflow-auto rounded-lg border bg-muted p-4 font-mono text-sm">
                {JSON.stringify(
                  Object.fromEntries(
                    entries.map((e) => [e.key, e.textValue || e.binaryValue || ""])
                  ),
                  null,
                  2
                )}
              </pre>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Ключ</TableHead>
                  <TableHead>Значение</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.key}>
                    <TableCell className="font-mono text-sm font-medium">
                      {entry.key}
                    </TableCell>
                    <TableCell>
                      <ValueCell
                        value={entry.textValue || entry.binaryValue || ""}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="versions" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID версии</TableHead>
                <TableHead>Описание</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Создана</TableHead>
                <TableHead>Ключей</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-xs">
                    {v.id.substring(0, 12)}...
                    {v.id === secret.currentVersion?.id && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        текущая
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {v.description || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        v.status === "ACTIVE"
                          ? "secondary"
                          : v.status === "SCHEDULED_FOR_DESTRUCTION"
                            ? "destructive"
                            : "outline"
                      }
                      className="text-xs"
                    >
                      {v.status}
                    </Badge>
                    {v.destroyAt && (
                      <p className="text-xs text-muted-foreground">
                        Удаление:{" "}
                        {new Date(v.destroyAt).toLocaleString("ru-RU")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(v.createdAt).toLocaleString("ru-RU")}
                  </TableCell>
                  <TableCell>{v.payloadEntryKeys?.length || 0}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {v.status === "ACTIVE" &&
                        v.id !== secret.currentVersion?.id && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              disabled={rollingBack === v.id}
                              onClick={() => handleRollback(v.id)}
                            >
                              {rollingBack === v.id ? "Откат..." : "Сделать текущей"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() =>
                                handleScheduleDestruction(v.id, "604800s")
                              }
                            >
                              Удалить через 7д
                            </Button>
                          </>
                        )}
                      {v.status === "SCHEDULED_FOR_DESTRUCTION" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => handleCancelDestruction(v.id)}
                        >
                          Отменить удаление
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <VersionCreateDialog
        open={showVersionDialog}
        onOpenChange={setShowVersionDialog}
        secretId={secretId}
        currentEntries={entries}
        currentVersionId={secret.currentVersion?.id || ""}
        onConflict={() => {
          setShowVersionDialog(false);
          setConflictDialog(true);
        }}
        onSuccess={() => {
          setShowVersionDialog(false);
          loadAll();
        }}
      />

      <SecretCreateDialog
        open={showCloneDialog}
        onOpenChange={setShowCloneDialog}
        folderId={secret.folderId}
        initialData={{
          name: secret.name,
          description: secret.description || "",
          kmsKeyId: secret.kmsKeyId,
          deletionProtection: secret.deletionProtection,
          labels: secret.labels || {},
          entries,
          sourceFolderId: secret.folderId,
        }}
        onSuccess={(newSecretId) => {
          setShowCloneDialog(false);
          if (newSecretId) {
            router.push(`/secrets/${newSecretId}`);
          }
        }}
      />

      <Dialog open={conflictDialog} onOpenChange={setConflictDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Секрет был изменён</DialogTitle>
            <DialogDescription>
              Другой пользователь изменил этот секрет, пока вы его редактировали.
              Необходимо перезагрузить данные перед внесением изменений.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={reloadAll}>
              Перезагрузить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Удаление секрета</DialogTitle>
            <DialogDescription>
              Это действие необратимо. Для подтверждения введите{" "}
              <span className="font-mono font-bold">delete</span> ниже.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="deleteConfirm">Подтверждение</Label>
            <Input
              id="deleteConfirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="delete"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== "delete" || deleting}
              onClick={() => {
                setShowDeleteDialog(false);
                handleDelete();
              }}
            >
              {deleting ? "Удаление..." : "Удалить секрет"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
