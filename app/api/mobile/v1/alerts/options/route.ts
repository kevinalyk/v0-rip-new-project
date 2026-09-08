import { withMobileAuth, mobileJson } from "@/lib/mobile-auth"
import { OFFICES, PARTIES, STATES } from "@/lib/campaign-filter-options"

// GET /api/mobile/v1/alerts/options — campaign-alert criteria metadata.
// This is intentionally separate from feed/filters so feed-tier restrictions do
// not accidentally remove alert creation from clients that can otherwise use it.
export const GET = withMobileAuth(async () =>
  mobileJson({
    states: STATES,
    parties: PARTIES,
    offices: OFFICES,
  }),
)
