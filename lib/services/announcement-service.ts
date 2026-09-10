import type { Prisma } from "@prisma/client"

import { MobileAuthError } from "@/lib/mobile-auth"
import prisma from "@/lib/prisma"

const MOBILE_ANNOUNCEMENT_PAGE_SIZE = 20
const MAX_CURSOR_ID_LENGTH = 100

export interface MobileAnnouncementCursor {
  publishedAt: string
  id: string
}

const announcementListSelect = {
  id: true,
  slug: true,
  title: true,
  body: true,
  imageUrl: true,
  publishedAt: true,
  updatedAt: true,
} satisfies Prisma.AnnouncementSelect

type AnnouncementListRow = Prisma.AnnouncementGetPayload<{
  select: typeof announcementListSelect
}>

const HTML_ENTITY_PATTERN = /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi
const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  rdquo: "”",
  rsquo: "’",
}

function decodeHtmlEntities(value: string): string {
  return value.replace(HTML_ENTITY_PATTERN, (match, decimal, hexadecimal, named) => {
    const codePoint = decimal
      ? Number.parseInt(decimal, 10)
      : hexadecimal
        ? Number.parseInt(hexadecimal, 16)
        : null
    if (codePoint !== null) {
      return codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match
    }
    return HTML_ENTITIES[String(named).toLowerCase()] ?? match
  })
}

export function announcementExcerpt(body: string, maxLength = 220): string {
  const plainText = decodeHtmlEntities(
    body
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<\/p\s*>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()

  if (plainText.length <= maxLength) return plainText
  return `${plainText.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export function encodeAnnouncementCursor(cursor: MobileAnnouncementCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}

export function decodeAnnouncementCursor(raw: string | null | undefined): MobileAnnouncementCursor | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"))
    const publishedAt = typeof parsed?.publishedAt === "string" ? parsed.publishedAt : ""
    const id = typeof parsed?.id === "string" ? parsed.id : ""
    if (
      publishedAt &&
      !Number.isNaN(new Date(publishedAt).getTime()) &&
      id.length > 0 &&
      id.length <= MAX_CURSOR_ID_LENGTH
    ) {
      return { publishedAt: new Date(publishedAt).toISOString(), id }
    }
  } catch {
    // Fall through to the shared malformed-cursor response.
  }

  throw new MobileAuthError(400, "INVALID_CURSOR", "The provided cursor is malformed")
}

function serializeAnnouncement(row: AnnouncementListRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: announcementExcerpt(row.body),
    imageUrl: row.imageUrl,
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listMobileAnnouncements(cursor: MobileAnnouncementCursor | null) {
  const cursorDate = cursor ? new Date(cursor.publishedAt) : null
  const rows = await prisma.announcement.findMany({
    where: cursorDate
      ? {
          OR: [
            { publishedAt: { lt: cursorDate } },
            { publishedAt: cursorDate, id: { lt: cursor.id } },
          ],
        }
      : undefined,
    select: announcementListSelect,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: MOBILE_ANNOUNCEMENT_PAGE_SIZE + 1,
  })

  const hasMore = rows.length > MOBILE_ANNOUNCEMENT_PAGE_SIZE
  const page = rows.slice(0, MOBILE_ANNOUNCEMENT_PAGE_SIZE)
  const last = page.at(-1)

  return {
    announcements: page.map(serializeAnnouncement),
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeAnnouncementCursor({ publishedAt: last.publishedAt.toISOString(), id: last.id })
        : null,
  }
}

export async function getMobileAnnouncement(slug: string) {
  const announcement = await prisma.announcement.findUnique({
    where: { slug },
    select: announcementListSelect,
  })

  if (!announcement) {
    throw new MobileAuthError(404, "ANNOUNCEMENT_NOT_FOUND", "Update not found")
  }

  return {
    ...serializeAnnouncement(announcement),
    body: announcement.body,
  }
}
