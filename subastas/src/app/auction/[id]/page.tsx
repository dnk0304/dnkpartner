import { Suspense } from "react";
import AuctionDetailClient from "./AuctionDetailClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

/**
 * /auction/[id] — the observatory detail page.
 *
 * Server shell wraps the client view in a Suspense boundary so the page is
 * SSR-friendly. The actual fetch happens client-side to keep the route fast,
 * tolerant to DB hiccups, and to allow the live countdown to start
 * immediately on hydrate.
 */
export default async function AuctionDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <AuctionDetailClient id={id} />
    </Suspense>
  );
}

function DetailSkeleton() {
  return (
    <div className="min-h-screen bg-[--color-page]">
      <div className="mx-auto max-w-editorial px-4 md:px-6 py-8 space-y-6">
        <div className="h-7 w-1/3 bg-[--color-surface-muted] rounded animate-pulse" />
        <div className="h-12 w-2/3 bg-[--color-surface-muted] rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-3">
            <div className="h-64 bg-[--color-surface-muted] rounded animate-pulse" />
            <div className="h-32 bg-[--color-surface-muted] rounded animate-pulse" />
          </div>
          <div className="h-96 bg-[--color-surface-muted] rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}
