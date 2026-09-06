import { withMobileAuth, mobileError, mobileJson } from "@/lib/mobile-auth"
import { MobileAuthError } from "@/lib/mobile-auth"
import { deleteAlert } from "@/lib/services/alert-service"

type Params = { params: Promise<{ id: string }> }

// DELETE /api/mobile/v1/alerts/:id — delete an alert (must belong to the current user).
export const DELETE = withMobileAuth<Params>(async (_request, ctx, { params }) => {
  const { id } = await params
  try {
    await deleteAlert(ctx.userId, id)
    return mobileJson({ ok: true })
  } catch (error) {
    if (error instanceof MobileAuthError) return mobileError(error.status, error.code, error.message)
    throw error
  }
})
