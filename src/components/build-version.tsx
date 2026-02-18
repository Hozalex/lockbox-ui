"use client";

const version = process.env.NEXT_PUBLIC_BUILD_VERSION || "dev";

export function BuildVersion() {
  return (
    <span
      className="fixed bottom-2 right-3 text-[10px] text-muted-foreground/50 select-none pointer-events-none"
      title={`Build: ${version}`}
    >
      {version}
    </span>
  );
}
