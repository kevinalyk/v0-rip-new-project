import { mobileJson, withMobileAuth } from "@/lib/mobile-auth"
import { getMobileAnnouncement } from "@/lib/services/announcement-service"

type Params = { params: Promise<{ slug: string }> }

// GET /api/mobile/v1/news/:slug — full rich-text product announcement.
export const GET = withMobileAuth<Params>(async (_request, _ctx, { params }) => {
  const { slug } = await params
  return mobileJson({ data: await getMobileAnnouncement(slug) })
})
