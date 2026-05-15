"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Loader2, ArrowLeft, Facebook, Link2, Trash2, ExternalLink } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"

interface DigestArticle {
  id: string
  slug: string
  title: string
  summary: string | null
  body: string
  imageUrl: string | null
  sources: { label: string; url: string }[] | null
  tags: string[] | null
  publishedAt: string
  createdBy: string
  updatedAt: string
}

// ─── Category badge colors ────────────────────────────────────────────────────
const CATEGORY_STYLES: Record<string, string> = {
  POLL:       "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  PRIMARY:    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  ENDORSE:    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "DEM WATCH":"bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  MONEY:      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  BREAKING:   "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  UPDATE:     "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
}

function getCategoryStyle(cat: string) {
  return CATEGORY_STYLES[cat.toUpperCase()] ?? "bg-muted text-muted-foreground"
}

// ─── Parse body HTML into structured story items ──────────────────────────────
interface StoryItem {
  category: string
  headline: string
  body: string
}

// Strip all HTML tags except <a> anchors (which become plain-text placeholders
// we can restore after stripping). This lets Claude embed hyperlinks in story
// bodies and have them survive the parse step.
function stripTagsPreserveLinks(html: string): string {
  // Replace </p> and <br> with a space to preserve word boundaries
  let out = html.replace(/<\/p>/gi, " ").replace(/<br\s*\/?>/gi, " ")
  // Keep anchor tags intact, strip everything else
  out = out.replace(/<(?!\/?\s*a[\s>])[^>]+>/g, "")
  return out.replace(/\s+/g, " ").trim()
}

function parseStories(html: string): { stories: StoryItem[]; remainder: string } | null {
  // Pattern: <strong>CATEGORY — Headline.</strong> Body text
  // Stop story body at the next story opener OR at a block-level structural element (table, h2, blockquote)
  const storyOpener = /(?:<p[^>]*>)?\s*<strong>[A-Z][A-Z &]+?\s*[—–-]/
  const blockBreak = /<\s*(table|h2|h3|blockquote|hr)[\s>]/i

  // Find where the first story opener is
  const firstMatch = storyOpener.exec(html)
  if (!firstMatch) return null

  // Anything before the first story opener is a preamble — ignore it here, handled separately
  let cursor = firstMatch.index
  const stories: StoryItem[] = []

  // Headline capture allows HTML inside <strong> (e.g. linked names): capture everything up to </strong>
  // then strip tags from it afterwards.
  const itemPattern = /<strong>([A-Z][A-Z &]+?)\s*[—–-]+\s*([\s\S]*?)<\/strong>\s*([\s\S]*?)(?=(?:<p[^>]*>|<li[^>]*>)?\s*<strong>[A-Z][A-Z &]+?\s*[—–-]|<\s*(?:table|h2|h3|blockquote|hr)[\s>]|$)/gi
  itemPattern.lastIndex = cursor

  let match
  let lastStoryEnd = cursor
  while ((match = itemPattern.exec(html)) !== null) {
    // Stop if we've hit a block-level structural break before this match
    const segment = html.slice(lastStoryEnd, match.index)
    if (blockBreak.test(segment)) break

    const category = match[1].trim()
    // Headline may contain inner HTML (linked names) — strip all tags for plain text display
    const headline = match[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().replace(/\.$/, "")
    // Body: preserve <a> links, strip all other tags
    const rawBody = stripTagsPreserveLinks(match[3])
    if (headline) stories.push({ category, headline, body: rawBody })
    lastStoryEnd = match.index + match[0].length
  }

  if (stories.length < 2) return null

  // Everything after the last story is "remainder" — tables, quotes, etc.
  const remainder = html.slice(lastStoryEnd).trim()
  return { stories, remainder }
}

const PROSE_CLASSES = `prose prose-neutral dark:prose-invert max-w-none text-base leading-relaxed text-foreground
  [&_a]:text-[#dc2a28] [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-[#b01f1d] [&_a]:transition-colors
  [&_img]:rounded-md [&_img]:max-w-full [&_img]:my-4
  [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2
  [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1
  [&_blockquote]:border-l-4 [&_blockquote]:border-[#dc2a28] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground
  [&_table]:min-w-full [&_table]:text-sm [&_th]:text-left [&_th]:py-2 [&_th]:px-3 [&_th]:font-semibold [&_th]:border-b [&_th]:border-border [&_th]:whitespace-nowrap
  [&_td]:py-2 [&_td]:px-3 [&_td]:border-b [&_td]:border-border/50 [&_td]:whitespace-nowrap`

// Wrap every <table> in a horizontally-scrollable container so it doesn't overflow on mobile
function wrapTables(html: string): string {
  return html.replace(
    /(<table[\s\S]*?<\/table>)/gi,
    '<div class="overflow-x-auto -mx-1 rounded-md my-4">$1</div>'
  )
}

// ─── Structured body renderer ─────────────────────────────────────────────────
function DigestBody({ html }: { html: string }) {
  const parsed = parseStories(html)

  if (parsed) {
    const { stories, remainder } = parsed
    return (
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[10px] font-bold tracking-widest text-[#dc2a28] uppercase">Today&apos;s Digest</span>
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs font-semibold text-muted-foreground">Top Stories</span>
        </div>
        <div className="space-y-3">
          {stories.map((s, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${getCategoryStyle(s.category)}`}
                >
                  {s.category}
                </span>
                <div>
                  <p className="text-sm font-semibold leading-snug text-foreground mb-1">{s.headline}</p>
                  {s.body && (
                    <p
                      className="text-sm text-muted-foreground leading-relaxed [&_a]:text-[#dc2a28] [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-[#b01f1d]"
                      dangerouslySetInnerHTML={{ __html: s.body }}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Remainder: polling tables, quotes, etc. rendered as styled HTML */}
        {remainder && (
          <div
            className={`mt-6 ${PROSE_CLASSES}`}
            dangerouslySetInnerHTML={{ __html: wrapTables(remainder) }}
          />
        )}
      </div>
    )
  }

  // Fallback: render raw HTML with prose styles
  return (
    <div
      className={`${PROSE_CLASSES} mb-10`}
      dangerouslySetInnerHTML={{ __html: wrapTables(html) }}
    />
  )
}

// ─── Main component ──────────────────────��────────────────────────────────────
export default function DigestArticleClient({
  slug,
  initialArticle,
}: {
  slug: string
  initialArticle?: DigestArticle | null
}) {
  const router = useRouter()
  const { toast } = useToast()

  const [userRole, setUserRole] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [article, setArticle] = useState<DigestArticle | null>(initialArticle ?? null)
  const [loading, setLoading] = useState(!initialArticle)
  const [notFound, setNotFound] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (res.ok) {
          const user = await res.json()
          setUserRole(user.role)
        }
      } catch { /* unauthenticated visitor */ }
      finally { setAuthLoading(false) }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    if (initialArticle || authLoading) return
    const fetchArticle = async () => {
      try {
        const res = await fetch(`/api/digest/${slug}`, { credentials: "include" })
        if (res.status === 404) { setNotFound(true); return }
        if (res.ok) setArticle(await res.json())
      } catch {
        toast({ title: "Error", description: "Failed to load article", variant: "destructive" })
      } finally {
        setLoading(false)
      }
    }
    fetchArticle()
  }, [authLoading, slug, initialArticle, toast])

  const handleDelete = async () => {
    if (!article) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/digest/${article.id}`, { method: "DELETE", credentials: "include" })
      if (res.ok) {
        toast({ title: "Article deleted" })
        router.push("/digest")
      } else {
        toast({ title: "Error", description: "Failed to delete article", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" })
    } finally {
      setDeleting(false)
    }
  }

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href)
    toast({ title: "Link copied to clipboard" })
  }

  const shareUrl = typeof window !== "undefined" ? window.location.href : ""
  const isSuperAdmin = userRole === "super_admin"

  if ((authLoading && !initialArticle) || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#dc2a28]" />
      </div>
    )
  }

  if (notFound || !article) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-lg font-medium">Article not found.</p>
        <Link href="/digest">
          <Button variant="outline" className="gap-2">
            <ArrowLeft size={14} />
            Back to Digest
          </Button>
        </Link>
      </div>
    )
  }

  const tags = article.tags ?? []
  const sources = article.sources ?? []
  const publishedDate = new Date(article.publishedAt)

  return (
    <>
      <div className="container mx-auto py-8 px-4 max-w-2xl">

        {/* Back link */}
        <Link
          href="/digest"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to Intelligence Digest
        </Link>

        {/* Header card */}
        <div className="rounded-xl border border-border bg-card px-6 py-5 mb-6">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span className="text-[10px] font-bold tracking-widest text-[#dc2a28] uppercase border border-[#dc2a28]/40 rounded px-2 py-0.5">
              Daily Digest
            </span>
            <span className="text-muted-foreground text-xs">
              {format(publishedDate, "EEEE, MMMM d, yyyy")}
            </span>
          </div>

          <h1 className="text-2xl font-bold leading-tight tracking-tight text-balance mb-3">
            {article.title}
          </h1>

          {article.summary && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {article.summary}
            </p>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-6">
            {tags.map((tag) => (
              <a
                key={tag}
                href={`/digest/tag/${tag}`}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border hover:border-[#dc2a28]/40 hover:text-foreground transition-colors"
              >
                {tag}
              </a>
            ))}
          </div>
        )}

        {/* Hero image */}
        {article.imageUrl && (
          <div className="w-full aspect-[16/7] overflow-hidden rounded-xl bg-muted mb-6">
            <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Body — parsed into structured cards or fallback prose */}
        <DigestBody html={article.body} />

        {/* Sources */}
        {sources.length > 0 && (
          <div className="mb-8 p-4 rounded-xl border border-border bg-muted/30">
            <h3 className="text-[10px] font-bold mb-3 text-muted-foreground uppercase tracking-widest">Sources</h3>
            <ul className="space-y-2">
              {sources.map((s, i) => (
                <li key={i} className="flex items-center gap-2">
                  <ExternalLink size={12} className="text-muted-foreground shrink-0" />
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#dc2a28] hover:underline"
                  >
                    {s.label || s.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer branding + share */}
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground mb-3">
            <span className="font-semibold text-foreground">Inbox.GOP</span>
            {" · Political Wire — Daily Republican intelligence digest published every weekday morning."}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/directory" className="text-xs text-[#dc2a28] hover:underline">← Directory</Link>
            <span className="text-muted-foreground text-xs">·</span>
            <Link href="/digest" className="text-xs text-[#dc2a28] hover:underline">All Digests</Link>
          </div>
        </div>

        {/* Share bar */}
        <div className="border-t border-border pt-5 mt-5 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">Share:</span>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
              </svg>
              X
            </Button>
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <Facebook size={12} />
              Facebook
            </Button>
          </a>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleCopyLink}>
            <Link2 size={12} />
            Copy Link
          </Button>

          {isSuperAdmin && (
            <>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={13} />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Article</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{article.title}</span>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting && <Loader2 size={14} className="animate-spin mr-1" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
