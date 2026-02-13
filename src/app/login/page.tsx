"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const YC_OAUTH_URL =
  "https://oauth.yandex.ru/authorize?response_type=token&client_id=example-client-id";

export default function LoginPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) return;

    setError(null);
    setLoading(true);

    const result = await login(trimmed);
    setLoading(false);

    if (result.ok) {
      router.push("/secrets");
    } else {
      setError(result.error || "Не удалось авторизоваться");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-[500px]">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Lockbox UI</CardTitle>
          <CardDescription>
            Управление секретами Yandex Cloud Lockbox
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Get token */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                1
              </span>
              <Label className="text-sm font-medium">
                Получите OAuth-токен
              </Label>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(YC_OAUTH_URL, "_blank")}
            >
              Открыть Yandex OAuth
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Авторизуйтесь и скопируйте токен со страницы
            </p>
          </div>

          <Separator />

          {/* Step 2: Paste token */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  2
                </span>
                <Label htmlFor="token" className="text-sm font-medium">
                  Вставьте токен
                </Label>
              </div>
              <Input
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="y3_Vdheub7w..."
                className="font-mono text-sm"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                OAuth-токен действителен 1 год. IAM-токен обновляется автоматически.
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading || !token.trim()}
            >
              {loading ? "Проверка..." : "Войти"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
