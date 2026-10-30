export const CORPORATE_ENTITY_TYPES = ["media", "retail"] as const

export function isCorporateEntityType(type: string | null | undefined): boolean {
  return !!type && (CORPORATE_ENTITY_TYPES as readonly string[]).includes(type)
}
