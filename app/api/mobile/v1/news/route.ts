import { mobileJson, withMobileAuth } from "@/lib/mobile-auth"
import {
  decodeAnnouncementCursor,
  listMobileAnnouncements,
} from "@/lib/services/announcement-service"

// GET /api/mobile/v1/news — authenticated, cursor-paginated product announcements.
export const GET = withMobileAuth(async (request) => {
  const cursor = decodeAnnouncementCursor(new URL(request.url).searchParams.get("cursor"))
  const result = await listMobileAnnouncements(cursor)

  return mobileJson({
    data: result.announcements,
    pagination: { nextCursor: result.nextCursor, hasMore: result.hasMore },
  })
})
