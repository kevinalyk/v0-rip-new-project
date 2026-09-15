import type { Prisma } from "@prisma/client"
import { z } from "zod"

import prisma from "@/lib/prisma"
import { MobileAuthError } from "@/lib/mobile-auth"
import { PARTIES, STATES } from "@/lib/campaign-filter-options"
import {
  MOBILE_DONATION_PLATFORMS,
  MOBILE_ENTITY_TYPES,
  type MobileDonationPlatform,
} from "@/lib/services/feed-service"

type SavedViewSettings = Record<string, unknown>

export interface MobileSavedViewFilters {
  search?: string
  entityIds?: string[]
  party?: string
  state?: string
  entityType?: string
  messageFilters?: Array<"email" | "sms" | "third_party" | "house_file">
  donationPlatform?: MobileDonationPlatform
  fromDate?: string
  toDate?: string
  subscriptionsOnly?: boolean
}

export interface NormalizedSavedView {
  filters: MobileSavedViewFilters
  entityNames: string[]
}

type SavedViewRecord = {
  id: string
  name: string
  filterSettings: Prisma.JsonValue
  createdAt: Date
  updatedAt: Date
}

type SavedViewEntity = { id: string; name: string }

const MESSAGE_FILTERS = new Set(["email", "sms", "third_party", "house_file"] as const)
const DONATION_PLATFORMS = new Set<string>(MOBILE_DONATION_PLATFORMS.map((item) => item.value))
const PARTY_VALUES = new Set(PARTIES.map((item) => item.value))
const ENTITY_TYPE_VALUES = new Set<string>(MOBILE_ENTITY_TYPES.map((item) => item.value))
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const dateOnlySchema = z.string().regex(DATE_ONLY).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
})

const createSavedViewSchema = z.object({
  name: z.string().trim().min(1).max(80),
  filters: z.object({
    search: z.string().trim().max(200).optional(),
    entityIds: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    party: z.string().trim().max(50).optional(),
    state: z.string().trim().max(10).optional(),
    entityType: z.string().trim().max(50).optional(),
    messageFilters: z.array(z.enum(["email", "sms", "third_party", "house_file"])).max(4).optional(),
    donationPlatform: z.enum(["winred", "actblue", "anedot", "psq", "ngpvan", "substack"]).optional(),
    fromDate: dateOnlySchema.optional(),
    toDate: dateOnlySchema.optional(),
    subscriptionsOnly: z.boolean().optional(),
  }).strict(),
}).strict()

export type CreateMobileSavedViewInput = z.infer<typeof createSavedViewSchema>

function asSettings(value: Prisma.JsonValue): SavedViewSettings {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SavedViewSettings)
    : {}
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function selectedValue(value: unknown): string | undefined {
  const selected = nonEmptyString(value)
  return selected && selected.toLowerCase() !== "all" ? selected : undefined
}

function dateOnly(value: unknown): string | undefined {
  const raw = nonEmptyString(value)
  if (!raw) return undefined
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10)
}

function senderNames(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : []
  return [...new Set(raw.map(nonEmptyString).filter((item): item is string => Boolean(item && item.toLowerCase() !== "all")))].slice(0, 100)
}

function savedEntityIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(nonEmptyString).filter((item): item is string => Boolean(item)))].slice(0, 100)
}

export function normalizeMobileSavedView(value: Prisma.JsonValue): NormalizedSavedView {
  const settings = asSettings(value)
  const messageFilters = new Set<"email" | "sms" | "third_party" | "house_file">()

  if (Array.isArray(settings.selectedMessageFilters)) {
    for (const value of settings.selectedMessageFilters) {
      if (typeof value === "string" && MESSAGE_FILTERS.has(value as "email" | "sms" | "third_party" | "house_file")) {
        messageFilters.add(value as "email" | "sms" | "third_party" | "house_file")
      }
    }
  }
  if (settings.selectedMessageType === "email" || settings.selectedMessageType === "sms") {
    messageFilters.add(settings.selectedMessageType)
  }
  if (settings.showThirdParty === true) messageFilters.add("third_party")
  if (settings.showHouseFileOnly === true) messageFilters.add("house_file")

  const dateRange = settings.dateRange && typeof settings.dateRange === "object" && !Array.isArray(settings.dateRange)
    ? (settings.dateRange as SavedViewSettings)
    : {}
  const donationPlatform = selectedValue(settings.selectedDonationPlatform)
  const search = nonEmptyString(settings.activeSearchQuery) || nonEmptyString(settings.searchTerm)
  const party = selectedValue(settings.selectedPartyFilter)
  const state = selectedValue(settings.selectedStateFilter)
  const entityType = selectedValue(settings.selectedEntityTypeFilter)
  const fromDate = dateOnly(dateRange.from)
  const toDate = dateOnly(dateRange.to)
  const entityIds = savedEntityIds(settings.mobileEntityIds)

  return {
    entityNames: senderNames(settings.selectedSender),
    filters: {
      ...(search ? { search } : {}),
      ...(entityIds.length ? { entityIds } : {}),
      ...(party ? { party } : {}),
      ...(state ? { state } : {}),
      ...(entityType ? { entityType } : {}),
      ...(messageFilters.size ? { messageFilters: [...messageFilters] } : {}),
      ...(donationPlatform && DONATION_PLATFORMS.has(donationPlatform)
        ? { donationPlatform: donationPlatform as MobileDonationPlatform }
        : {}),
      ...(fromDate ? { fromDate } : {}),
      ...(toDate ? { toDate } : {}),
      ...(settings.subscriptionsOnly === true ? { subscriptionsOnly: true } : {}),
    },
  }
}

export function validateMobileSavedViewInput(value: unknown): CreateMobileSavedViewInput {
  const parsed = createSavedViewSchema.safeParse(value)
  if (!parsed.success) {
    throw new MobileAuthError(400, "INVALID_BODY", "Provide a name and valid feed filters")
  }

  const { filters } = parsed.data
  if (filters.party && !PARTY_VALUES.has(filters.party)) {
    throw new MobileAuthError(400, "INVALID_BODY", "Unsupported party")
  }
  if (filters.state && !STATES.includes(filters.state)) {
    throw new MobileAuthError(400, "INVALID_BODY", "Unsupported state")
  }
  if (filters.entityType && !ENTITY_TYPE_VALUES.has(filters.entityType)) {
    throw new MobileAuthError(400, "INVALID_BODY", "Unsupported entity type")
  }
  if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
    throw new MobileAuthError(400, "INVALID_BODY", "fromDate must be before or equal to toDate")
  }

  return {
    ...parsed.data,
    filters: {
      ...filters,
      ...(filters.search ? { search: filters.search } : { search: undefined }),
      entityIds: filters.entityIds ? [...new Set(filters.entityIds)] : undefined,
      messageFilters: filters.messageFilters ? [...new Set(filters.messageFilters)] : undefined,
    },
  }
}

export function mobileFiltersToWebSettings(
  filters: MobileSavedViewFilters,
  entityNames: string[],
): Prisma.InputJsonObject {
  const messageFilters = [...new Set(filters.messageFilters || [])]
  const messageTypes = messageFilters.filter((item) => item === "email" || item === "sms")

  return {
    activeSearchQuery: filters.search || "",
    searchTerm: filters.search || "",
    selectedSender: entityNames,
    mobileEntityIds: filters.entityIds || [],
    selectedPartyFilter: filters.party || "all",
    selectedStateFilter: filters.state || "all",
    selectedEntityTypeFilter: filters.entityType || "all",
    selectedMessageType: messageTypes.length === 1 ? messageTypes[0] : "all",
    selectedMessageFilters: messageFilters,
    selectedDonationPlatform: filters.donationPlatform || "all",
    showThirdParty: messageFilters.includes("third_party"),
    showHouseFileOnly: messageFilters.includes("house_file"),
    dateRange: {
      from: filters.fromDate || null,
      to: filters.toDate || null,
    },
    subscriptionsOnly: filters.subscriptionsOnly === true,
  }
}

export async function createMobileSavedView(userId: string, clientId: string, value: unknown) {
  const input = validateMobileSavedViewInput(value)
  const entityIds = input.filters.entityIds || []
  const entities: SavedViewEntity[] = entityIds.length
    ? await prisma.ciEntity.findMany({
        where: { id: { in: entityIds }, type: { not: "data_broker" } },
        select: { id: true, name: true },
      })
    : []
  if (entities.length !== entityIds.length) {
    throw new MobileAuthError(400, "INVALID_BODY", "One or more selected entities are unavailable")
  }

  const namesById = new Map(entities.map((entity) => [entity.id, entity.name]))
  const entityNames = entityIds.map((id) => namesById.get(id)).filter((name): name is string => Boolean(name))
  const created = await prisma.ciView.create({
    data: {
      name: input.name,
      clientId,
      createdBy: userId,
      filterSettings: mobileFiltersToWebSettings(input.filters, entityNames),
    },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  })

  return { ...created, filters: input.filters }
}

export async function listMobileSavedViews(clientId: string) {
  const views: SavedViewRecord[] = await prisma.ciView.findMany({
    where: { clientId },
    select: { id: true, name: true, filterSettings: true, createdAt: true, updatedAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })
  const normalized: Array<SavedViewRecord & NormalizedSavedView> = views.map((view) => ({
    ...view,
    ...normalizeMobileSavedView(view.filterSettings),
  }))
  const names = [...new Set(normalized.flatMap((view) => view.entityNames))]
  const savedIds = [...new Set(normalized.flatMap((view) => view.filters.entityIds || []))]
  const entities: SavedViewEntity[] = names.length || savedIds.length
    ? await prisma.ciEntity.findMany({
        where: {
          type: { not: "data_broker" },
          OR: [
            ...(savedIds.length ? [{ id: { in: savedIds } }] : []),
            ...(names.length ? [{ name: { in: names, mode: "insensitive" as const } }] : []),
          ],
        },
        select: { id: true, name: true },
      })
    : []
  const validEntityIds = new Set(entities.map((entity) => entity.id))
  const entityIdsByName = new Map<string, string[]>()
  for (const entity of entities) {
    const key = entity.name.trim().toLowerCase()
    entityIdsByName.set(key, [...(entityIdsByName.get(key) || []), entity.id])
  }

  return normalized.map((view) => ({
    id: view.id,
    name: view.name,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    filters: {
      ...view.filters,
      ...(view.filters.entityIds?.length
        ? { entityIds: view.filters.entityIds.filter((id) => validEntityIds.has(id)) }
        : view.entityNames.length
          ? { entityIds: view.entityNames.flatMap((name) => entityIdsByName.get(name.toLowerCase()) || []) }
        : {}),
    },
  }))
}
