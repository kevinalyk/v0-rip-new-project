"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, Pencil, Trash2, Upload, X, Megaphone, ArrowRight, Bold, Italic, ImagePlus, List, Code2 } from "lucide-react"
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

interface NewsPageClientProps {
  initialAnnouncements: Announcement[]
}

export default function NewsPageClient({ initialAnnouncements }: NewsPageClientProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [userRole, setUserRole] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  // Seed with server-rendered data so crawlers see real article cards immediately.
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements)
  const [loading, setLoading] = useState(false)

  // Create / edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Announcement | null>(null)
  const [formTitle, setFormTitle] = useState("")
  const [formBody, setFormBody] = useState("")
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [inlineImageUploading, setInlineImageUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sourceMode, setSourceMode] = useState(false)
  const [sourceHtml, setSourceHtml] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inlineImageInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null)
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
        // Ignore — unauthenticated visitors can still read news
      } finally {
        setAuthLoading(false)
      }
    }
    checkAuth()
  }, [router])

  // Re-fetch when auth resolves for admin users (to get unpublished drafts etc.)
  const fetchAnnouncements = useCallback(async (role: string | null) => {
    try {
      setLoading(true)
      const url = role ? "/api/announcements" : "/api/announcements?public=1"
      const res = await fetch(url, { credentials: "include" })
      if (res.ok) setAnnouncements(await res.json())
    } catch {
      toast({ title: "Error", description: "Failed to load announcements", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  // Only re-fetch after auth if the user is an admin (they may see extra posts)
  useEffect(() => {
    if (!authLoading && userRole) {
      fetchAnnouncements(userRole)
    }
  }, [authLoading, userRole, fetchAnnouncements])

  const openCreate = () => {
    setEditTarget(null)
    setFormTitle("")
    setFormBody("")
    setFormImageUrl(null)
    setSourceMode(false)
    setSourceHtml("")
    setDialogOpen(true)
    setTimeout(() => { if (editorRef.current) editorRef.current.innerHTML = "" }, 0)
  }

  const openEdit = (a: Announcement, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setEditTarget(a)
    setFormTitle(a.title)
    setFormBody(a.body)
    setFormImageUrl(a.imageUrl)
    setSourceMode(false)
    setSourceHtml(a.body)
    setDialogOpen(true)
    setTimeout(() => { if (editorRef.current) editorRef.current.innerHTML = a.body }, 0)
  }

  const toggleSourceMode = () => {
    if (!sourceMode) {
      const html = editorRef.current?.innerHTML ?? ""
      setSourceHtml(html)
    } else {
      setTimeout(() => { if (editorRef.current) editorRef.current.innerHTML = sourceHtml }, 0)
    }
    setSourceMode((prev) => !prev)
  }

  const handleImageUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB", variant: "destructive" })
      return
    }
    setImageUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/announcements/upload-image", { method: "POST", body: fd, credentials: "include" })
      const data = await res.json()
      if (res.ok) {
        setFormImageUrl(data.url)
      } else {
        toast({ title: "Upload failed", description: data.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Upload failed", description: "Something went wrong", variant: "destructive" })
    } finally {
      setImageUploading(false)
    }
  }

  const handleInlineImageUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB", variant: "destructive" })
      return
    }
    setInlineImageUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/announcements/upload-image", { method: "POST", body: fd, credentials: "include" })
      const data = await res.json()
      if (res.ok && editorRef.current) {
        editorRef.current.focus()
        const img = document.createElement("img")
        img.src = data.url
        img.alt = "Inline image"
        img.style.maxWidth = "100%"
        img.style.borderRadius = "6px"
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
      const payload = { title: formTitle, body: editorHtml, imageUrl: formImageUrl }
      const res = editTarget
        ? await fetch(`/api/announcements/${editTarget.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            credentials: "include",
          })
        : await fetch("/api/announcements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            credentials: "include",
          })

      if (res.ok) {
        toast({ title: editTarget ? "Post updated" : "Post published" })
        setDialogOpen(false)
        fetchAnnouncements(userRole)
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
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/announcements/${deleteTarget.id}`, { method: "DELETE", credentials: "include" })
      if (res.ok) {
        toast({ title: "Post deleted" })
        setDeleteTarget(null)
        fetchAnnouncements(userRole)
      } else {
        toast({ title: "Error", description: "Failed to delete post", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" })
    } finally {
      setDeleting(false)
    }
  }

  const isNew = (dateStr: string) => differenceInDays(new Date(), new Date(dateStr)) < NEW_THRESHOLD_DAYS
  const isSuperAdmin = userRole === "super_admin"

  return (
    <>
    <div className="container mx-auto py-8 px-4 max-w-3xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Megaphone size={22} className="text-[#dc2a28]" />
              <h1 className="text-2xl font-bold tracking-tight">{"What's New"}</h1>
            </div>
            <p className="text-sm text-muted-foreground">Updates, improvements, and new features from the Inbox.GOP team</p>
          </div>
          {isSuperAdmin && (
            <Button onClick={openCreate} className="bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white gap-2">
              <Plus size={15} />
              New Post
            </Button>
          )}
        </div>

        {/* Feed */}
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-[#dc2a28]" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <Megaphone size={40} className="text-muted-foreground/30" />
            <p className="text-muted-foreground">No posts yet.</p>
            {isSuperAdmin && (
              <Button onClick={openCreate} variant="outline" size="sm" className="mt-2 gap-2">
                <Plus size={13} />
                Publish the first post
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {announcements.map((a, idx) => (
              <article key={a.id} className="group rounded-xl border border-border bg-card overflow-hidden hover:border-[#dc2a28]/40 hover:shadow-md transition-all">

                {/* Image banner */}
                {a.imageUrl ? (
                  <div className="relative w-full aspect-[16/6] overflow-hidden bg-muted">
                    <img
                      src={a.imageUrl}
                      alt={a.title}
                      className="w-full h-full object-cover"
                    />
                    {idx === 0 && isNew(a.publishedAt) && (
                      <span className="absolute top-3 left-3 bg-[#dc2a28] text-white text-[11px] font-semibold px-2 py-0.5 rounded">
                        New!
                      </span>
                    )}
                    {isSuperAdmin && (
                      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="secondary" size="icon" className="h-7 w-7" onClick={(e) => openEdit(a, e)}>
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(a) }}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative w-full bg-[#dc2a28]/10 border-b border-border px-6 py-5 flex items-center justify-between">
                    {idx === 0 && isNew(a.publishedAt) && (
                      <span className="bg-[#dc2a28] text-white text-[11px] font-semibold px-2 py-0.5 rounded">
                        New!
                      </span>
                    )}
                    {isSuperAdmin && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => openEdit(a, e)}>
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(a) }}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Card body */}
                <div className="px-5 py-4">
                  <time dateTime={new Date(a.publishedAt).toISOString()} className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide block">
                    {format(new Date(a.publishedAt), "MMMM d, yyyy")}
                  </time>
                  <h2 className="text-lg font-bold leading-snug mb-2 group-hover:text-[#dc2a28] transition-colors text-balance">
                    <a href={`/news/${a.slug}`} className="hover:underline">{a.title}</a>
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-4">
                    {a.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}
                  </p>
                  <Link href={`/news/${a.slug}`} aria-label={`Continue reading ${a.title}`}>
                    <Button className="bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white gap-2 rounded-lg">
                      Continue Reading
                      <ArrowRight size={14} />
                    </Button>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
    </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open && !saving) setDialogOpen(false) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editTarget ? "Edit Post" : "New Post"}</DialogTitle>
            <DialogDescription>
              {editTarget ? "Update this announcement." : "Publish a new announcement visible to all users."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="post-title">Title</Label>
              <Input
                id="post-title"
                placeholder="e.g., New filtering options in the CI Feed"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Body</Label>
              <div className="flex items-center gap-1 border border-border rounded-t-md px-2 py-1 bg-muted/50 flex-wrap">
                {!sourceMode && (
                  <>
                    <Button
                      type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title="Bold"
                      onMouseDown={(e) => { e.preventDefault(); document.execCommand("bold") }}
                      disabled={saving}
                    >
                      <Bold size={14} />
                    </Button>
                    <Button
                      type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title="Italic"
                      onMouseDown={(e) => { e.preventDefault(); document.execCommand("italic") }}
                      disabled={saving}
                    >
                      <Italic size={14} />
                    </Button>
                    <Button
                      type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title="Bullet List"
                      onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertUnorderedList") }}
                      disabled={saving}
                    >
                      <List size={14} />
                    </Button>
                    <div className="w-px h-4 bg-border mx-1" />
                    <Button
                      type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1.5 text-xs"
                      title="Insert image"
                      onClick={() => inlineImageInputRef.current?.click()}
                      disabled={saving || inlineImageUploading}
                    >
                      {inlineImageUploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                      {inlineImageUploading ? "Uploading..." : "Insert Image"}
                    </Button>
                    <input
                      ref={inlineImageInputRef}
                      type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleInlineImageUpload(f) }}
                    />
                    <div className="w-px h-4 bg-border mx-1" />
                  </>
                )}
                <Button
                  type="button"
                  variant={sourceMode ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2 gap-1.5 text-xs ml-auto"
                  title="Toggle HTML source"
                  onClick={toggleSourceMode}
                  disabled={saving}
                >
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
                  data-placeholder="Describe what's new..."
                />
              )}

              {sourceMode && (
                <textarea
                  className="min-h-[280px] w-full rounded-b-md border border-t-0 border-border bg-background px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                  value={sourceHtml}
                  onChange={(e) => setSourceHtml(e.target.value)}
                  disabled={saving}
                  placeholder="<p>Write HTML here...</p>"
                  spellCheck={false}
                />
              )}

              <style>{`
                [data-placeholder]:empty:before {
                  content: attr(data-placeholder);
                  color: hsl(var(--muted-foreground));
                  pointer-events: none;
                }
              `}</style>
            </div>

            <div className="space-y-1.5">
              <Label>Image (optional)</Label>
              {formImageUrl ? (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <img src={formImageUrl} alt="Preview" className="w-full max-h-48 object-cover" />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7"
                    onClick={() => setFormImageUrl(null)}
                    disabled={saving}
                  >
                    <X size={13} />
                  </Button>
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 cursor-pointer hover:border-[#dc2a28]/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {imageUploading
                    ? <Loader2 size={20} className="animate-spin text-muted-foreground" />
                    : <Upload size={20} className="text-muted-foreground" />
                  }
                  <p className="text-xs text-muted-foreground">
                    {imageUploading ? "Uploading..." : "Click to upload an image (max 5MB)"}
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f) }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || imageUploading}
              className="bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editTarget ? "Save Changes" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{deleteTarget?.title}</span>? This cannot be undone.
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
