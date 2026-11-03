"use client";

import { signIn } from "next-auth/react";
import { useAuth } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const { keycloakEnabled, provider } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-[500px]">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Lockbox UI</CardTitle>
          <CardDescription>
            {provider === "huawei" ? "Управление секретами Huawei Cloud CSMS" : "Управление секретами Yandex Cloud Lockbox"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {keycloakEnabled ? (
            <Button className="w-full" size="lg" onClick={() => signIn("keycloak", { callbackUrl: "/secrets" })}>
              Войти через Keycloak
            </Button>
          ) : provider !== null ? (
            <p className="text-sm text-muted-foreground">Вход не настроен: требуется Keycloak.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
