import { Suspense } from "react";
import SubastasListClient from "./SubastasListClient";

/**
 * /subastas — canonical list of auctions with the four-question simple filter
 * sidebar, progressive "Más filtros" disclosure, and list/cards/map toggle.
 */
export default function SubastasListPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[--color-page]" />}>
      <SubastasListClient />
    </Suspense>
  );
}
