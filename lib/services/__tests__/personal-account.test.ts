import assert from "node:assert/strict"
import test from "node:test"

import {
  createPersonalWorkspaceIdentity,
  normalizedWorkspaceName,
  suggestedPersonalWorkspaceName,
  uniqueWorkspaceName,
  workspaceSlug,
} from "@/lib/services/personal-account-service"

test("suggests a friendly personal workspace without trusting an organization name", () => {
  assert.equal(
    suggestedPersonalWorkspaceName({ firstName: "  Jamie ", lastName: " Smith  ", email: "jsmith@example.com" }),
    "Jamie Smith's workspace",
  )
  assert.equal(
    suggestedPersonalWorkspaceName({ email: "person@example.com" }),
    "person's workspace",
  )
})

test("normalizes names and produces URL-safe, unique workspace slugs", () => {
  assert.equal(normalizedWorkspaceName("  Campaign   Portal  "), "Campaign Portal")
  assert.equal(workspaceSlug("José's Team!", "ABC-123"), "jose-s-team-abc123")
  assert.equal(uniqueWorkspaceName("Jamie's workspace", "personal_ABC123DEF"), "Jamie's workspace person")
})

test("creates opaque personal client IDs instead of deriving database IDs from email", () => {
  const first = createPersonalWorkspaceIdentity({ firstName: "Jamie", email: "jamie@example.com" })
  const second = createPersonalWorkspaceIdentity({ firstName: "Jamie", email: "jamie@example.com" })
  assert.match(first.id, /^personal_[a-f0-9]{32}$/)
  assert.match(first.slug, /^jamie-s-workspace-[a-f0-9]{10}$/)
  assert.notEqual(first.id, second.id)
  assert.notEqual(first.slug, second.slug)
})
