import { redirect } from "next/navigation";

/**
 * Legacy /admin/dashboard route — kept as a redirect shim to /admin.
 *
 * Wave18: Dennis directed the full dashboard to live at /admin. The page
 * content that used to live here was promoted to /admin/page.tsx. This shim
 * preserves any existing bookmarks/links to /admin/dashboard.
 *
 * Admin gating is enforced upstream by /admin/layout.tsx, so unauthorized
 * visitors are redirected to /login or / before this shim even runs.
 */
export const dynamic = "force-dynamic";

export default function AdminDashboardRedirect() {
  redirect("/admin");
}
