import { withMobileAuth, mobileJson } from "@/lib/mobile-auth"
import { PARTIES, STATES } from "@/lib/campaign-filter-options"
import prisma from "@/lib/prisma"
import { MOBILE_ALERT_MESSAGE_TYPES, MOBILE_ALERT_OWNERSHIP_TYPES } from "@/lib/services/alert-service"
import { requireMobileAlerts } from "@/lib/services/authz"
import {
  MOBILE_DONATION_PLATFORMS,
  MOBILE_ENTITY_TYPES,
  listMobileFeedEntities,
} from "@/lib/services/feed-service"

export const GET = withMobileAuth(async (_request, ctx) => {
  const { clientId } = requireMobileAlerts(ctx)
  const [entities, tags] = await Promise.all([
    listMobileFeedEntities(clientId),
    prisma.entityTag.findMany({
      where: { clientId },
      distinct: ["tagName"],
      orderBy: { tagName: "asc" },
      select: { tagName: true },
    }),
  ]) as [Awaited<ReturnType<typeof listMobileFeedEntities>>, { tagName: string }[]]

  return mobileJson({
    states: STATES,
    parties: PARTIES,
    entityTypes: MOBILE_ENTITY_TYPES,
    messageTypes: MOBILE_ALERT_MESSAGE_TYPES.map((value) => ({ value, label: value === "sms" ? "SMS" : "Email" })),
    ownershipTypes: MOBILE_ALERT_OWNERSHIP_TYPES.map((value) => ({
      value,
      label: value === "house_file" ? "House File" : "Third Party",
    })),
    donationPlatforms: MOBILE_DONATION_PLATFORMS,
    entities,
    tags: tags.map(({ tagName }) => ({ value: tagName, label: tagName })),
  })
})
