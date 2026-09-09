import { mobileJson, withMobileAuth } from "@/lib/mobile-auth"
import { requireClientContext } from "@/lib/services/authz"
import { getDirectoryEntity } from "@/lib/services/directory-service"

type Params = { params: Promise<{ id: string }> }

// GET /api/mobile/v1/entities/:id — mobile Directory profile and recent activity.
export const GET = withMobileAuth<Params>(async (_request, ctx, { params }) => {
  const { clientId, plan } = requireClientContext(ctx)
  const { id } = await params
  const entity = await getDirectoryEntity(clientId, plan, id)
  return mobileJson({ data: entity })
})
