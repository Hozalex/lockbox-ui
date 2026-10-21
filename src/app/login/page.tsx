"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
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
  "https://oauth.yandex.ru/authorize?response_type=token&client_id=1a6990aa636648e9b2ef855fa7bec2fb";

export default function LoginPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login, keycloakEnabled, provider, capabilities } = useAuth();
  // Token login only for providers that support it (YC); hidden until config loads.
  const showTokenLogin = provider !== null && capabilities.tokenLogin;
  const router = useRouter();

  const handleOAuthSubmit = async (e: React.FormEvent) => {
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

  const handleKeycloakLogin = () => {
    signIn("keycloak", { callbackUrl: "/secrets" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-[500px]">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Lockbox UI</CardTitle>
          <CardDescription>
            {provider === "huawei"
              ? "Управление секретами Huawei Cloud CSMS"
              : "Управление секретами Yandex Cloud Lockbox"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Keycloak login (only when configured) */}
          {keycloakEnabled && (
            <>
              <Button
                className="w-full"
                size="lg"
                onClick={handleKeycloakLogin}
              >
                Войти через Keycloak
              </Button>
              {showTokenLogin && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      или
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {provider !== null && !keycloakEnabled && !capabilities.tokenLogin && (
            <p className="text-sm text-muted-foreground">
              Вход не настроен: для этого провайдера нужен Keycloak.
            </p>
          )}

          {/* OAuth token login (providers with token login only) */}
          {showTokenLogin && (
            <>
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

              <form onSubmit={handleOAuthSubmit} className="space-y-4">
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
                  variant={keycloakEnabled ? "outline" : "default"}
                  disabled={loading || !token.trim()}
                >
                  {loading ? "Проверка..." : "Войти с OAuth-токеном"}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
