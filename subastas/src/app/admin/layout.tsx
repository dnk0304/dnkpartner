import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

/**
 * Central admin gate (server component).
 *
 * Locks every page under /admin/* in one place. Before this layout existed,
 * /admin, /admin/dashboard, /admin/scraper, /admin/layout-editor served page
 * shells (HTML + bundle) to ANY visitor — data was gated by individual APIs
 * (some of which were ALSO broken; see scraper/health route fixes), but the
 * page shells leaked admin UI/UX and were a privilege-escalation surface
 * once a low-privilege user logged in.
 *
 * Defense-in-depth: this guards the page shells; API routes still gate
 * themselves via requireAdmin().
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login?next=/admin");
  }
  if (!isAdminEmail(session.user.email)) {
    redirect("/");
  }
  return <>{children}</>;
}
