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

  const loadSecrets = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/secrets?folderId=${folderId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setSecrets(data.secrets || []))
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
