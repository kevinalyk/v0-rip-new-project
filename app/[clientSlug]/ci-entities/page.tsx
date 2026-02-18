import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth"
import { CiEntityManagement } from "@/components/ci-entity-management"

export default async function CiEntitiesPage({ params }: { params: { clientSlug: string } }) {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth_token")?.value

  if (!token) {
    redirect("/login")
  }

  const payload = await verifyToken(token)
  if (!payload) {
    redirect("/login")
  }

  if (payload.role !== "super_admin") {
    redirect(`/${params.clientSlug}`)
  }

  return <CiEntityManagement clientSlug={params.clientSlug} />
}
