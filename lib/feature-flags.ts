// Simple hard-coded feature flags for functionality that is fully built and wired up on the
// backend, but intentionally not yet exposed to users. Flip the constant to `true` (and deploy)
// to go live - no other code changes should be required.

// Allows clients to connect additional (paid, $50/mo add-on) Slack bot channels on top of
// their one free Slack bot. All plumbing (schema, billing, API routes, alert fan-out) is in
// place - this flag only controls whether the "Add another bot" UI is shown and whether the
// add/remove-bot API routes accept requests.
export const SLACK_MULTI_BOT_ENABLED = false
