"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import AppLayout from "@/components/app-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, ArrowLeft, Facebook, Link2, Pencil, Trash2 } from "lucide-react"
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
import { format, differenceInDays } from "date-fns"

interface Announcement {
  id: string
  slug: string
  title: string
  body: string
  imageUrl: string | null
  publishedAt: string
  createdBy: string
  updatedAt: string
}

const NEW_THRESHOLD_DAYS = 7

export default function NewsPostClient({ slug }: { slug: string }) {
  const router = useRouter()
  const { toast } = useToast()

  const [userRole, setUserRole] = useState<string | null>(null)
  const [clientSlug, setClientSlug] = useState<string>("")
  const [authLoading, setAuthLoading] = useState(true)
  const [post, setPost] = useState<Announcement | null>(null)
  const [loading, setLoading] = useState(true)
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
          setClientSlug(user.clientId || "rip")
        }
        // Not authenticated — that's fine, news is public. Just leave userRole as null.
      } catch {
        // Ignore — unauthenticated visitors can still read news
      } finally {
        setAuthLoading(false)
      }
    }
    checkAuth()
  }, [router])

  useEffect(() => {
    if (authLoading) return
    const fetchPost = async () => {
      try {
        // Use ?public=1 for unauthenticated visitors, authenticated path for logged-in users
        const url = userRole
          ? `/api/announcements/by-slug/${slug}`
          : `/api/announcements/by-slug/${slug}?public=1`
        const res = await fetch(url, { credentials: "include" })
        if (res.status === 404) { setNotFound(true); return }
        if (res.ok) setPost(await res.json())
      } catch {
        toast({ title: "Error", description: "Failed to load post", variant: "destructive" })
      } finally {
        setLoading(false)
      }
    }
    fetchPost()
  }, [authLoading, slug, userRole])

  const handleDelete = async () => {
    if (!post) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/announcements/${post.id}`, { method: "DELETE", credentials: "include" })
      if (res.ok) {
        toast({ title: "Post deleted" })
        router.push("/news")
      } else {
        toast({ title: "Error", description: "Failed to delete post", variant: "destructive" })
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
  const shareTitle = post?.title || ""

  const isNew = (dateStr: string) => differenceInDays(new Date(), new Date(dateStr)) < NEW_THRESHOLD_DAYS
  const isSuperAdmin = userRole === "super_admin"

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#dc2a28]" />
      </div>
    )
  }

  if (notFound) {
    return (
      <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-lg font-medium">Post not found.</p>
          <Link href="/news">
            <Button variant="outline" className="gap-2">
              <ArrowLeft size={14} />
              Back to News
            </Button>
          </Link>
        </div>
      </AppLayout>
    )
  }

  if (!post) return null

  return (
    <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
      {/* Full-width image banner */}
      {post.imageUrl && (
        <div className="w-full h-[260px] overflow-hidden">
          <img
            src={post.imageUrl}
            alt={post.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="container mx-auto py-8 px-4 max-w-3xl">

        {/* Back link */}
        <Link href="/news" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size={14} />
          Back to News
        </Link>

        {/* Meta */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {format(new Date(post.publishedAt), "MMMM d, yyyy")}
          </p>
          {isNew(post.publishedAt) && (
            <Badge className="bg-[#dc2a28] text-white text-[10px] px-1.5 py-0">New!</Badge>
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-balance mb-6">
          {post.title}
        </h1>

        {/* Body */}
        <div
          className="prose prose-neutral dark:prose-invert max-w-none text-base leading-relaxed text-foreground mb-10 [&_img]:rounded-md [&_img]:max-w-full [&_img]:my-4 [&_a]:text-[#dc2a28] [&_a]:underline [&_a]:break-all hover:[&_a]:text-[#dc2a28]/80"
          dangerouslySetInnerHTML={{ __html: post.body }}
        />

        {/* Share bar */}
        <div className="border-t border-border pt-6 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">Share:</span>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`}
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

          {/* Super admin controls */}
          {isSuperAdmin && (
            <>
              <div className="flex-1" />
              <Link href={`/news?edit=${post.id}`}>
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <Pencil size={13} />
                  Edit
                </Button>
              </Link>
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
            <AlertDialogTitle>Delete Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{post.title}</span>? This cannot be undone.
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
    </AppLayout>
  )
}
