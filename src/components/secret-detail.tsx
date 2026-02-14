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
import type { Secret, PayloadEntry, SecretVersion } from "@/lib/types";

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

  const loadSecret = useCallback(() => {
    return fetch(`/api/secrets/${secretId}`)
      .then((r) => r.json())
      .then(setSecret)
      .catch(console.error);
  }, [secretId]);

  const loadPayload = useCallback(
    (versionId?: string) => {
      const qs = versionId ? `?versionId=${versionId}` : "";
      return fetch(`/api/secrets/${secretId}/payload${qs}`)
        .then((r) => r.json())
        .then((data) => {
          setEntries(data.entries || []);
          if (data.versionId) setSelectedVersionId(data.versionId);
        })
        .catch(console.error);
    },
    [secretId]
  );

  const loadVersions = useCallback(() => {
    return fetch(`/api/secrets/${secretId}/versions`)
      .then((r) => r.json())
      .then((data) => setVersions(data.versions || []))
      .catch(console.error);
  }, [secretId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadSecret(), loadPayload(), loadVersions()]).finally(() =>
      setLoading(false)
    );
  }, [loadSecret, loadPayload, loadVersions]);

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

  const handleRollback = async (versionId: string) => {
    setRollingBack(versionId);
    try {
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
      await Promise.all([loadSecret(), loadPayload(), loadVersions()]);
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
      <div className="py-8 text-center text-destructive">
        Секрет не найден
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
        onSuccess={() => {
          loadSecret();
          loadPayload();
          loadVersions();
          setShowVersionDialog(false);
        }}
      />

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
