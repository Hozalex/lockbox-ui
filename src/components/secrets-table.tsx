"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Copy, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/session-provider";
import { computeProjectTabs, normalizeProject } from "@/lib/rbac";
import type { Secret, SecretVersion } from "@/lib/types";

interface SecretsTableProps {
  folderId: string;
  folderName: string | null;
  onCreateClick: (project: string | null) => void;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-800",
  CREATING: "bg-yellow-100 text-yellow-800",
};

export function SecretsTable({ folderId, folderName, onCreateClick }: SecretsTableProps) {
  const router = useRouter();
  const { authMode, roles, projects: registry } = useAuth();
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [versionCounts, setVersionCounts] = useState<Record<string, number | null>>({});
  const [activeTab, setActiveTab] = useState<string>("all");

  // Normalized project (registry-validated label) per secret.
  const secretProjects = useMemo(
    () => new Map(secrets.map((s) => [s.id, normalizeProject(s.labels, registry)])),
    [secrets, registry]
  );

  // Project tabs to render, derived from roles, registry and visible secrets.
  const tabs = useMemo(
    () =>
      computeProjectTabs({
        isOAuth: authMode === "oauth",
        roles,
        folderName,
        registry,
        secretProjects: secrets.map((s) => secretProjects.get(s.id) ?? null),
      }),
    [authMode, roles, folderName, registry, secrets, secretProjects]
  );

  // Keep the active tab valid as tabs change.
  useEffect(() => {
    if (tabs.length === 0) return;
    if (!tabs.some((t) => t.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  const currentTab = tabs.find((t) => t.key === activeTab) ?? tabs[0];

  const visibleSecrets = useMemo(() => {
    if (!currentTab || currentTab.kind === "all") return secrets;
    return secrets.filter(
      (s) => (secretProjects.get(s.id) ?? null) === currentTab.project
    );
  }, [secrets, secretProjects, currentTab]);

  const loadVersionCounts = useCallback(async (secretList: Secret[]) => {
    const counts: Record<string, number | null> = {};
    secretList.forEach((s) => (counts[s.id] = null));
    setVersionCounts(counts);

    await Promise.all(
      secretList.map(async (secret) => {
        try {
          const r = await fetch(`/api/secrets/${secret.id}/versions`);
          if (!r.ok) {
            setVersionCounts((prev) => ({ ...prev, [secret.id]: -1 }));
            return;
          }
          const data = await r.json();
          const versions: SecretVersion[] = data.versions || [];
          const activeCount = versions.filter((v) => v.status === "ACTIVE").length;
          setVersionCounts((prev) => ({ ...prev, [secret.id]: activeCount }));
        } catch {
          setVersionCounts((prev) => ({ ...prev, [secret.id]: -1 }));
        }
      })
    );
  }, []);

  const copyId = useCallback((id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const loadSecrets = useCallback(async (retry = 0) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/secrets?folderId=${folderId}`);
      if (!r.ok) {
        if (r.status === 401) {
          router.push("/login");
          return;
        }
        const body = await r.text().catch(() => "");
        let msg = `HTTP ${r.status}`;
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) msg = parsed.error;
        } catch {
          // use default msg
        }
        if (r.status === 403 && msg === `HTTP ${r.status}`) {
          msg = "Нет доступа к секретам в этом каталоге. Проверьте права IAM-токена.";
        }
        throw new Error(msg);
      }
      const data = await r.json();
      const list: Secret[] = data.secrets || [];
      list.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
      setSecrets(list);
      if (list.length > 0) {
        loadVersionCounts(list);
      }
    } catch (e) {
      const msg = (e as Error).message;
      // Network-level errors ("fetch failed", "Failed to fetch") — auto-retry
      if (retry < 2 && /fetch failed|failed to fetch|network/i.test(msg)) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return loadSecrets(retry + 1);
      }
      setError(/fetch failed|failed to fetch/i.test(msg)
        ? "Не удалось подключиться к API. Проверьте сетевое соединение."
        : msg);
    } finally {
      setLoading(false);
    }
  }, [folderId, router, loadVersionCounts]);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  if (loading) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-7 w-36" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3 flex gap-6">
            {[140, 130, 70, 60, 70, 60, 100].map((w, i) => (
              <Skeleton key={i} className="h-4" style={{ width: w }} />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border-b last:border-0 px-4 py-3 flex gap-6 items-center">
              <Skeleton className="h-4 w-[140px]" />
              <Skeleton className="h-4 w-[130px]" />
              <Skeleton className="h-5 w-[70px] rounded-full" />
              <Skeleton className="h-4 w-[60px]" />
              <Skeleton className="h-4 w-[70px]" />
              <Skeleton className="h-4 w-[60px]" />
              <div className="flex gap-1">
                <Skeleton className="h-5 w-[100px] rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-destructive">Ошибка: {error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => loadSecrets()}>
          Повторить
        </Button>
      </div>
    );
  }

  const canCreate = !!currentTab?.canCreate;
  // Show the tab bar whenever there's a real project (or "Без проекта") tab —
  // including a single empty project tab, so a project-scoped dev sees where to
  // create. A lone "Все" tab (no projects) isn't worth rendering.
  const showTabs = tabs.some((t) => t.kind !== "all");

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Секреты ({visibleSecrets.length})
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadSecrets()}>
            Обновить
          </Button>
          {canCreate && (
            <Button
              size="sm"
              onClick={() => onCreateClick(currentTab?.project ?? null)}
            >
              Создать секрет
            </Button>
          )}
        </div>
      </div>

      {showTabs && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
                {t.access === "ro" && t.kind === "project" && (
                  <Badge variant="outline" className="ml-1.5 text-[10px]">
                    ro
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {visibleSecrets.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          Нет секретов в этом каталоге
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Имя</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Версий</TableHead>
              <TableHead>Ключей</TableHead>
              <TableHead>Создан</TableHead>
              <TableHead>Метки</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleSecrets.map((secret) => (
              <TableRow key={secret.id}>
                <TableCell>
                  <Link
                    href={`/secrets/${secret.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {secret.name || secret.id}
                  </Link>
                  {secret.description && (
                    <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                      {secret.description}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs text-muted-foreground">
                      {secret.id.substring(0, 10)}...
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => copyId(secret.id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
                        >
                          {copiedId === secret.id ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {copiedId === secret.id
                          ? "Скопировано!"
                          : "Копировать ID"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={STATUS_COLORS[secret.status] || ""}
                  >
                    {secret.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {versionCounts[secret.id] === null
                    ? "…"
                    : versionCounts[secret.id] === -1
                      ? "—"
                      : versionCounts[secret.id]}
                </TableCell>
                <TableCell>
                  {secret.currentVersion?.payloadEntryKeys?.length || 0}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(secret.createdAt).toLocaleDateString("ru-RU")}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(secret.labels || {}).map(
                      ([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}={value}
                        </Badge>
                      )
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
