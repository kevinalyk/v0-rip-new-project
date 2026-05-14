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

  return (
    <>
      {/* Hero image */}
      {article.imageUrl && (
        <div className="w-full h-[260px] overflow-hidden">
          <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="container mx-auto py-8 px-4 max-w-3xl">
        {/* Back link */}
        <Link
          href="/digest"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to Intelligence Digest
        </Link>

        {/* Meta */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <time
            dateTime={new Date(article.publishedAt).toISOString()}
            className="text-xs text-muted-foreground uppercase tracking-wide"
          >
            {format(new Date(article.publishedAt), "MMMM d, yyyy")}
          </time>
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-balance mb-6">
          {article.title}
        </h1>

        {/* Summary if present */}
        {article.summary && (
          <p className="text-base text-muted-foreground leading-relaxed mb-6 border-l-4 border-[#dc2a28] pl-4 italic">
            {article.summary}
          </p>
        )}

        {/* Body */}
        <div
          className="prose prose-neutral dark:prose-invert max-w-none text-base leading-relaxed text-foreground mb-10 [&_img]:rounded-md [&_img]:max-w-full [&_img]:my-4"
          dangerouslySetInnerHTML={{ __html: article.body }}
        />

        {/* Sources */}
        {sources.length > 0 && (
          <div className="mb-10 p-4 rounded-lg border border-border bg-muted/30">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Sources</h3>
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

        {/* Share bar */}
        <div className="border-t border-border pt-6 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">Share:</span>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
              <Facebook size={14} />
              Facebook
            </Button>
          </a>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleCopyLink}>
            <Link2 size={14} />
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
