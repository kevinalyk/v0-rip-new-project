import type { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"
import {
  MOBILE_DONATION_PLATFORMS,
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
  filters: Omit<MobileSavedViewFilters, "entityIds">
  entityNames: string[]
}

const MESSAGE_FILTERS = new Set(["email", "sms", "third_party", "house_file"] as const)
const DONATION_PLATFORMS = new Set<string>(MOBILE_DONATION_PLATFORMS.map((item) => item.value))

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

  return {
    entityNames: senderNames(settings.selectedSender),
    filters: {
      ...(search ? { search } : {}),
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

export async function listMobileSavedViews(clientId: string) {
  const views = await prisma.ciView.findMany({
    where: { clientId },
    select: { id: true, name: true, filterSettings: true, createdAt: true, updatedAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })
  const normalized = views.map((view) => ({ ...view, ...normalizeMobileSavedView(view.filterSettings) }))
  const names = [...new Set(normalized.flatMap((view) => view.entityNames))]
  const entities = names.length
    ? await prisma.ciEntity.findMany({
        where: { name: { in: names, mode: "insensitive" }, type: { not: "data_broker" } },
        select: { id: true, name: true },
      })
    : []
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
      ...(view.entityNames.length
        ? { entityIds: view.entityNames.flatMap((name) => entityIdsByName.get(name.toLowerCase()) || []) }
        : {}),
    },
  }))
}
