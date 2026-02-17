import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth"
import { BlockedDomainsContent } from "@/components/blocked-domains-content"
import { AppLayout } from "@/components/app-layout"

export default async function AdminBlockedDomainsPage({ params }: { params: { clientSlug: string } }) {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth_token")?.value

  if (!token) {
    redirect("/login")
  }

  const payload = await verifyToken(token)
  if (!payload) {
    redirect("/login")
  }

  // Only super_admins can access admin pages
  if (payload.role !== "super_admin") {
    redirect(`/${params.clientSlug}`)
  }

  // Only RIP client can access admin pages
  if (params.clientSlug !== "rip") {
    redirect(`/${params.clientSlug}`)
  }

  return (
    <AppLayout clientSlug="rip" isAdminView={true}>
      <BlockedDomainsContent />
    </AppLayout>
  )
}
