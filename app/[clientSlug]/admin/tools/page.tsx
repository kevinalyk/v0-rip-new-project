import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth"
import { AdminContent } from "@/components/admin-content"
import { AppLayout } from "@/components/app-layout"

export default async function AdminToolsPage({ params }: { params: { clientSlug: string } }) {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth_token")?.value

  if (!token) {
    redirect("/login")
  }

  const payload = await verifyToken(token)
  if (!payload) {
    redirect("/login")
  }

  // Only super_admins can access admin tools
  if (payload.role !== "super_admin") {
    redirect(`/${params.clientSlug}`)
  }

  // Only RIP client can access admin pages
  if (params.clientSlug !== "rip") {
    redirect(`/${params.clientSlug}`)
  }

  return (
    <AppLayout clientSlug="rip" isAdminView={true}>
      <div className="container mx-auto py-8 px-4">
        <AdminContent />
      </div>
    </AppLayout>
  )
}
