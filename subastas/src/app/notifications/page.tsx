/**
 * /notifications — inbox page.
 *
 * Self-contained light header (no TopBar dependency so we don't collide with
 * Forge's MAP redeploy). Includes a "Volver" link back to the dashboard.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NotificationInbox } from "@/components/notifications/NotificationInbox";

export const metadata = {
  title: "Notificaciones · SubastaPro",
  description: "Cambios de estado y avisos de las subastas que sigues.",
};

export default function NotificationsPage() {
  return (
    <main className="min-h-screen bg-[#FBF8F3]">
      <div className="border-b border-[#1F3A5F]/10 bg-white">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1F3A5F]/80 hover:text-[#1F3A5F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A5F]/40 rounded px-1"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver al panel
          </Link>
        </div>
      </div>
      <NotificationInbox />
    </main>
  );
}
