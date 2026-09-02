/**
 * /admin/blog — article list (server-rendered shell).
 *
 * Admin gate enforced by the underlying /api/admin/articles endpoints
 * (requireAdmin), which the client component below calls. We also redirect
 * non-admin users away at the page level to avoid showing the empty
 * admin shell to randoms.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { AdminBlogList } from "./AdminBlogList";

export const dynamic = "force-dynamic";

export default async function AdminBlogPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin/blog");
  if (!isAdminEmail(session.user.email)) redirect("/");

  return <AdminBlogList />;
}
