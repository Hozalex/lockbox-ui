import { Skeleton } from "@/components/ui/skeleton";

/** Full-page skeleton shown while auth/session is being resolved */
export function PageLoader() {
  return (
    <div className="min-h-screen">
      {/* Header skeleton */}
      <div className="border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-[200px]" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <main className="container mx-auto px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-7 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
        <div className="rounded-lg border">
          {/* Table header */}
          <div className="border-b px-4 py-3 flex gap-6">
            {[140, 120, 80, 60, 80, 100].map((w, i) => (
              <Skeleton key={i} className="h-4" style={{ width: w }} />
            ))}
          </div>
          {/* Table rows */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border-b last:border-0 px-4 py-3 flex gap-6 items-center">
              {[140, 120, 80, 60, 80, 100].map((w, j) => (
                <Skeleton key={j} className="h-4" style={{ width: w }} />
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
