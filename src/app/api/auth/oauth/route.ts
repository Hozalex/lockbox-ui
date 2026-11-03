import { NextResponse } from "next/server";

// Retired endpoint: old clients cannot establish a token session.
export async function GET() {
  return NextResponse.json({ authenticated: false });
}

export async function POST() {
  return NextResponse.json({ error: "Вход доступен только через Keycloak" }, { status: 410 });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  for (const name of ["oauth_token", "iam_token", "iam_expires_at"]) {
    response.cookies.set(name, "", {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: 0,
    });
  }
  return response;
}
