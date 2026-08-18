"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
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
import {
  Loader2, ArrowLeft, Facebook, Link2, Pencil, Trash2,
  Bold, Italic, List, ImagePlus, Code2, Upload, X,
} from "lucide-react"

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

export default function NewsPostClient({ slug, initialPost }: { slug: string; initialPost?: Announcement | null }) {
  const router = useRouter()
  const { toast } = useToast()

  const [userRole, setUserRole] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [post, setPost] = useState<Announcement | null>(initialPost ?? null)
  const [loading, setLoading] = useState(!initialPost)
  const [notFound, setNotFound] = useState(false)

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false)
  const [formTitle, setFormTitle] = useState("")
  const [formBody, setFormBody] = useState("")
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [sourceMode, setSourceMode] = useState(false)
  const [sourceHtml, setSourceHtml] = useState("")
  const [imageUploading, setImageUploading] = useState(false)
  const [inlineImageUploading, setInlineImageUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inlineImageInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  // Delete dialog state
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
      } catch {
        // unauthenticated visitors can still read news
      } finally {
        setAuthLoading(false)
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    if (initialPost || authLoading) return
    const fetchPost = async () => {
      try {
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
  }, [authLoading, slug, userRole, initialPost])

  const openEdit = () => {
    if (!post) return
    setFormTitle(post.title)
    setFormBody(post.body)
    setFormImageUrl(post.imageUrl)
    setSourceMode(false)
    setSourceHtml(post.body)
    setEditOpen(true)
    setTimeout(() => {
      if (editorRef.current) editorRef.current.innerHTML = post.body
    }, 0)
  }

  const toggleSourceMode = () => {
    if (!sourceMode) {
      // switching to source: snapshot the visual editor
      setSourceHtml(editorRef.current?.innerHTML ?? "")
    } else {
      // switching back to visual: push source into the editor
      setTimeout(() => {
        if (editorRef.current) editorRef.current.innerHTML = sourceHtml
      }, 0)
    }
    setSourceMode((m) => !m)
  }

  const handleBannerUpload = async (file: File) => {
    setImageUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/announcements/upload-image", { method: "POST", body: fd, credentials: "include" })
      const data = await res.json()
      if (res.ok) setFormImageUrl(data.url)
      else toast({ title: "Upload failed", description: data.error, variant: "destructive" })
    } catch {
      toast({ title: "Upload failed", description: "Something went wrong", variant: "destructive" })
    } finally {
      setImageUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleInlineImageUpload = async (file: File) => {
    setInlineImageUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/announcements/upload-image", { method: "POST", body: fd, credentials: "include" })
      const data = await res.json()
      if (res.ok && editorRef.current) {
        const img = document.createElement("img")
        img.src = data.url
        img.alt = ""
        img.style.maxWidth = "100%"
        img.style.margin = "8px 0"
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0)
          range.deleteContents()
          range.insertNode(img)
          range.setStartAfter(img)
          range.collapse(true)
          sel.removeAllRanges()
          sel.addRange(range)
        } else {
          editorRef.current.appendChild(img)
        }
      } else {
        toast({ title: "Upload failed", description: data.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Upload failed", description: "Something went wrong", variant: "destructive" })
    } finally {
      setInlineImageUploading(false)
      if (inlineImageInputRef.current) inlineImageInputRef.current.value = ""
    }
  }

  const handleSave = async () => {
    if (!post) return
    const editorHtml = sourceMode ? sourceHtml : (editorRef.current?.innerHTML ?? "")
    const editorText = sourceMode
      ? sourceHtml.replace(/<[^>]*>/g, "").trim()
      : (editorRef.current?.innerText?.trim() ?? "")
    if (!formTitle.trim() || !editorText) {
      toast({ title: "Required", description: "Title and body are required", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/announcements/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: formTitle, body: editorHtml, imageUrl: formImageUrl }),
        credentials: "include",
      })
      if (res.ok) {
        const updated = await res.json()
        setPost(updated)
        setEditOpen(false)
        toast({ title: "Post updated" })
      } else {
        const data = await res.json()
        toast({ title: "Error", description: data.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

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

  if ((authLoading && !initialPost) || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#dc2a28]" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-lg font-medium">Post not found.</p>
        <Link href="/news">
          <Button variant="outline" className="gap-2">
            <ArrowLeft size={14} />
            Back to News
          </Button>
        </Link>
      </div>
    )
  }

  if (!post) return null

  return (
    <>
      {post.imageUrl && (
        <div className="w-full h-[260px] overflow-hidden">
          <img src={post.imageUrl} alt={post.title} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="container mx-auto py-8 px-4 max-w-3xl">
        <Link href="/news" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size={14} />
          Back to News
        </Link>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <time dateTime={new Date(post.publishedAt).toISOString()} className="text-xs text-muted-foreground uppercase tracking-wide">
            {format(new Date(post.publishedAt), "MMMM d, yyyy")}
          </time>
          {isNew(post.publishedAt) && (
            <Badge className="bg-[#dc2a28] text-white text-[10px] px-1.5 py-0">New!</Badge>
          )}
        </div>

        <h1 className="text-3xl font-bold leading-tight tracking-tight text-balance mb-6">{post.title}</h1>

        <div
          className="prose prose-neutral dark:prose-invert max-w-none text-base leading-relaxed text-foreground mb-10 [&_img]:rounded-md [&_img]:max-w-full [&_img]:my-4"
          dangerouslySetInnerHTML={{ __html: post.body }}
        />

        <div className="border-t border-border pt-6 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">Share:</span>
          <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
              </svg>
              X
            </Button>
          </a>
          <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer">
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
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={openEdit}>
                <Pencil size={13} />
                Edit
              </Button>
              <Button
                variant="ghost" size="sm"
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

      {/* Inline edit dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!open && !saving) setEditOpen(false) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Edit Post</DialogTitle>
            <DialogDescription>Update this announcement.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            {/* Banner image */}
            <div className="space-y-1.5">
              <Label>Banner Image</Label>
              {formImageUrl ? (
                <div className="relative w-full h-32 rounded-md overflow-hidden border border-border">
                  <img src={formImageUrl} alt="Banner" className="w-full h-full object-cover" />
                  <Button
                    type="button" variant="destructive" size="sm"
                    className="absolute top-2 right-2 h-7 w-7 p-0"
                    onClick={() => setFormImageUrl(null)} disabled={saving}
                  >
                    <X size={12} />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button" variant="outline" size="sm" className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving || imageUploading}
                >
                  {imageUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {imageUploading ? "Uploading..." : "Upload Banner"}
                </Button>
              )}
              <input
                ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBannerUpload(f) }}
              />
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-post-title">Title</Label>
              <Input
                id="edit-post-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                disabled={saving}
              />
            </div>

            {/* Body editor */}
            <div className="space-y-1.5">
              <Label>Body</Label>
              <div className="flex items-center gap-1 border border-border rounded-t-md px-2 py-1 bg-muted/50 flex-wrap">
                {!sourceMode && (
                  <>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title="Bold"
                      onMouseDown={(e) => { e.preventDefault(); document.execCommand("bold") }} disabled={saving}>
                      <Bold size={14} />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title="Italic"
                      onMouseDown={(e) => { e.preventDefault(); document.execCommand("italic") }} disabled={saving}>
                      <Italic size={14} />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title="Bullet List"
                      onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertUnorderedList") }} disabled={saving}>
                      <List size={14} />
                    </Button>
                    <div className="w-px h-4 bg-border mx-1" />
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1.5 text-xs"
                      onClick={() => inlineImageInputRef.current?.click()}
                      disabled={saving || inlineImageUploading}>
                      {inlineImageUploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                      {inlineImageUploading ? "Uploading..." : "Insert Image"}
                    </Button>
                    <input ref={inlineImageInputRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleInlineImageUpload(f) }} />
                    <div className="w-px h-4 bg-border mx-1" />
                  </>
                )}
                <Button type="button" variant={sourceMode ? "secondary" : "ghost"} size="sm"
                  className="h-7 px-2 gap-1.5 text-xs ml-auto"
                  onClick={toggleSourceMode} disabled={saving}>
                  <Code2 size={13} />
                  {sourceMode ? "Visual" : "HTML"}
                </Button>
              </div>

              {!sourceMode && (
                <div
                  ref={editorRef}
                  contentEditable={!saving}
                  suppressContentEditableWarning
                  className="min-h-[280px] w-full rounded-b-md border border-t-0 border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring overflow-auto [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                />
              )}
              {sourceMode && (
                <textarea
                  className="min-h-[280px] w-full rounded-b-md border border-t-0 border-border bg-background px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                  value={sourceHtml}
                  onChange={(e) => setSourceHtml(e.target.value)}
                  disabled={saving}
                  spellCheck={false}
                />
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white">
              {saving && <Loader2 size={14} className="animate-spin mr-1" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
              {deleting && <Loader2 size={14} className="animate-spin mr-1" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
