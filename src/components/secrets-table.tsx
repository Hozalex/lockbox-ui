"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Copy, Check } from "lucide-react";
import type { Secret } from "@/lib/types";

interface SecretsTableProps {
  folderId: string;
  onCreateClick: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-800",
  CREATING: "bg-yellow-100 text-yellow-800",
};

export function SecretsTable({ folderId, onCreateClick }: SecretsTableProps) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const loadSecrets = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/secrets?folderId=${folderId}`)
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 403) {
            throw new Error("Нет доступа к секретам в этом каталоге. Проверьте права IAM-токена.");
          }
          const body = await r.text().catch(() => "");
          let msg = `HTTP ${r.status}`;
          try {
            const parsed = JSON.parse(body);
            if (parsed.error) msg = parsed.error;
          } catch {
            // use default msg
          }
          throw new Error(msg);
        }
        return r.json();
      })
      .then((data) => {
        const list: Secret[] = data.secrets || [];
        list.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
        setSecrets(list);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [folderId]);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Загрузка секретов...</div>;
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-destructive">Ошибка: {error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={loadSecrets}>
          Повторить
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Секреты ({secrets.length})
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadSecrets}>
            Обновить
          </Button>
          <Button size="sm" onClick={onCreateClick}>
            Создать секрет
          </Button>
        </div>
      </div>

      {secrets.length === 0 ? (
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
              <TableHead>Ключей</TableHead>
              <TableHead>Создан</TableHead>
              <TableHead>Метки</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {secrets.map((secret) => (
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
