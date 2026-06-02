/**
 * /admin/blog/[slug] — editor entry point.
 *
 * Special slug "new" opens the create form. Anything else loads the existing
 * article via /api/admin/articles/[slug].
 *
 * Admin gate via session check + the API's requireAdmin.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ADMIN_EMAIL } from "@/lib/auth-helpers";
import { AdminBlogEditor } from "../AdminBlogEditor";

export const dynamic = "force-dynamic";

export default async function AdminBlogEditorPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin/blog");
  if (session.user.email !== ADMIN_EMAIL) redirect("/");

  const { slug } = await params;
  return <AdminBlogEditor slugParam={slug} />;
}
