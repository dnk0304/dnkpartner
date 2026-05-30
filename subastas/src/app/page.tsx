import { Suspense } from "react";
import HomeObservatory from "./HomeObservatory";

/**
 * / — observatory home.
 *
 * Per UX vision (doc 03): the hero is the data, not an illustration.
 *   1. Live trueActiveCount as the headline number ("Subastas activas ahora")
 *   2. "Últimas actualizaciones" live feed — proof of live tracking
 *   3. Spain map + provincia grid (existing components, restyled)
 *   4. Honest "Cómo funciona" copy at the bottom (no marketing fluff)
 */
export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[--color-page]" />}>
      <HomeObservatory />
    </Suspense>
  );
}
