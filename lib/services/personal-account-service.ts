import { randomUUID } from "crypto"

const MAX_WORKSPACE_NAME_LENGTH = 100

function cleanNamePart(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ") || ""
}

export function suggestedPersonalWorkspaceName(input: {
  firstName?: string | null
  lastName?: string | null
  email: string
}): string {
  const fullName = [cleanNamePart(input.firstName), cleanNamePart(input.lastName)]
    .filter(Boolean)
    .join(" ")
  const emailPrefix = input.email.split("@")[0]?.trim() || "Personal"
  return `${fullName || emailPrefix}'s workspace`.slice(0, MAX_WORKSPACE_NAME_LENGTH)
}

export function normalizedWorkspaceName(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_WORKSPACE_NAME_LENGTH)
}

export function workspaceSlug(value: string, uniqueSuffix: string): string {
  const base = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "personal"
  return `${base}-${uniqueSuffix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10)}`
}

export function createPersonalWorkspaceIdentity(input: {
  firstName?: string | null
  lastName?: string | null
  email: string
}): { id: string; name: string; slug: string } {
  const nonce = randomUUID().replace(/-/g, "")
  const name = suggestedPersonalWorkspaceName(input)
  return {
    id: `personal_${nonce}`,
    name,
    slug: workspaceSlug(name, nonce.slice(0, 10)),
  }
}

export function uniqueWorkspaceName(baseName: string, uniqueSuffix: string): string {
  const suffix = uniqueSuffix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6)
  return `${baseName.slice(0, Math.max(1, MAX_WORKSPACE_NAME_LENGTH - suffix.length - 1))} ${suffix}`
}
