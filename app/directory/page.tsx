import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth"
import AppLayout from "@/components/app-layout"
import { CiDirectoryContent } from "@/components/ci-directory-content"

export default async function PublicDirectoryPage() {
  // Resolve clientSlug server-side so the page ships with pre-rendered HTML
  // that bots and AI agents can read. Unauthenticated visitors get an empty
  // string, which CiDirectoryContent already handles gracefully.
  let clientSlug = ""

  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth_token")?.value
    if (token) {
      const payload = await verifyToken(token)
      if (payload) {
        clientSlug = (payload.clientSlug as string) || ""
      }
    }
  } catch {
    // unauthenticated visitor — no-op
  }

  return (
    <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
      <CiDirectoryContent clientSlug={clientSlug} isPublic={!clientSlug} />
    </AppLayout>
  )
}
