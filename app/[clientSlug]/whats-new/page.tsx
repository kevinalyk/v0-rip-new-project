"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import AppLayout from "@/components/app-layout"
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
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Plus, Pencil, Trash2, Upload, X, Megaphone } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { format, formatDistanceToNow, differenceInDays } from "date-fns"

interface Announcement {
  id: string
  title: string
  body: string
  imageUrl: string | null
  publishedAt: string
  createdBy: string
  updatedAt: string
}

const NEW_THRESHOLD_DAYS = 7

export default function WhatsNewPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const clientSlug = params.clientSlug as string

  const [userRole, setUserRole] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  // Detail view
  const [selectedPost, setSelectedPost] = useState<Announcement | null>(null)

  // Create / edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Announcement | null>(null)
  const [formTitle, setFormTitle] = useState("")
  const [formBody, setFormBody] = useState("")
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (!res.ok) { router.push("/login"); return }
        const user = await res.json()
        setUserRole(user.role)
      } catch {
        router.push("/login")
      } finally {
        setAuthLoading(false)
      }
    }
    checkAuth()
  }, [router])

  const fetchAnnouncements = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/announcements", { credentials: "include" })
      if (res.ok) setAnnouncements(await res.json())
    } catch {
      toast({ title: "Error", description: "Failed to load announcements", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading) fetchAnnouncements()
  }, [authLoading])

  const openCreate = () => {
    setEditTarget(null)
    setFormTitle("")
    setFormBody("")
    setFormImageUrl(null)
    setDialogOpen(true)
  }

  const openEdit = (a: Announcement) => {
    setEditTarget(a)
    setFormTitle(a.title)
    setFormBody(a.body)
    setFormImageUrl(a.imageUrl)
    setDialogOpen(true)
  }

  const handleImageUpload = async (file: File) => {
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

  const handleSave = async () => {
    if (!formTitle.trim() || !formBody.trim()) {
      toast({ title: "Required", description: "Title and body are required", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const payload = { title: formTitle, body: formBody, imageUrl: formImageUrl }
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
        fetchAnnouncements()
        if (selectedPost?.id === editTarget?.id) setSelectedPost(await res.json())
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
        if (selectedPost?.id === deleteTarget.id) setSelectedPost(null)
        fetchAnnouncements()
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

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#dc2a28]" />
      </div>
    )
  }

  return (
    <AppLayout clientSlug={clientSlug}>
      <div className="container mx-auto py-8 px-4 max-w-4xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Megaphone size={24} className="text-[#dc2a28]" />
              <h1 className="text-2xl font-bold">{"What's New"}</h1>
            </div>
            <p className="text-sm text-muted-foreground">Updates, improvements, and new features</p>
          </div>
          {isSuperAdmin && (
            <Button onClick={openCreate} className="bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white gap-2">
              <Plus size={16} />
              New Post
            </Button>
          )}
        </div>

        {/* Post list */}
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-[#dc2a28]" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <Megaphone size={40} className="text-muted-foreground/40" />
            <p className="text-muted-foreground">No announcements yet.</p>
            {isSuperAdmin && (
              <Button onClick={openCreate} variant="outline" size="sm" className="mt-2 gap-2">
                <Plus size={14} />
                Publish the first post
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {announcements.map((a, idx) => (
              <article
                key={a.id}
                onClick={() => setSelectedPost(a)}
                className="group relative flex gap-5 rounded-xl border border-border bg-card p-5 cursor-pointer hover:border-[#dc2a28]/40 hover:shadow-sm transition-all"
              >
                {/* Left: date column */}
                <div className="hidden sm:flex flex-col items-center w-16 shrink-0 pt-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {format(new Date(a.publishedAt), "MMM")}
                  </span>
                  <span className="text-2xl font-bold leading-none">
                    {format(new Date(a.publishedAt), "d")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(a.publishedAt), "yyyy")}
                  </span>
                </div>

                {/* Divider */}
                <div className="hidden sm:block w-px bg-border self-stretch" />

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap mb-1">
                    <h2 className="font-semibold text-base leading-snug group-hover:text-[#dc2a28] transition-colors">
                      {a.title}
                    </h2>
                    {idx === 0 && isNew(a.publishedAt) && (
                      <Badge className="bg-[#dc2a28] text-white text-[10px] px-1.5 py-0 shrink-0">New!</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{a.body}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDistanceToNow(new Date(a.publishedAt), { addSuffix: true })}
                  </p>
                </div>

                {/* Thumbnail */}
                {a.imageUrl && (
                  <div className="hidden sm:block shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border">
                    <img src={a.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Super admin actions */}
                {isSuperAdmin && (
                  <div
                    className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 right-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(a)}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(a)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {/* --- Detail view dialog --- */}
      <Dialog open={!!selectedPost} onOpenChange={(open) => !open && setSelectedPost(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedPost && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-2 flex-wrap">
                  <DialogTitle className="text-xl leading-snug flex-1">{selectedPost.title}</DialogTitle>
                  {isNew(selectedPost.publishedAt) && (
                    <Badge className="bg-[#dc2a28] text-white text-[10px] px-1.5 py-0 shrink-0 mt-1">New!</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(selectedPost.publishedAt), "MMMM d, yyyy")} &middot;{" "}
                  {formatDistanceToNow(new Date(selectedPost.publishedAt), { addSuffix: true })}
                </p>
              </DialogHeader>

              {selectedPost.imageUrl && (
                <div className="rounded-lg overflow-hidden border border-border my-2">
                  <img src={selectedPost.imageUrl} alt="" className="w-full object-cover max-h-72" />
                </div>
              )}

              <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {selectedPost.body}
              </div>

              {isSuperAdmin && (
                <DialogFooter className="gap-2 pt-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setSelectedPost(null); openEdit(selectedPost) }}>
                    <Pencil size={13} />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => { setSelectedPost(null); setDeleteTarget(selectedPost) }}
                  >
                    <Trash2 size={13} />
                    Delete
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* --- Create / Edit dialog --- */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open && !saving) setDialogOpen(false) }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Post" : "New Post"}</DialogTitle>
            <DialogDescription>
              {editTarget ? "Update this announcement." : "Publish a new announcement visible to all users."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
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
              <Label htmlFor="post-body">Body</Label>
              <Textarea
                id="post-body"
                placeholder="Describe what's new..."
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                disabled={saving}
                rows={16}
                className="resize-y min-h-[240px]"
              />
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
                  {imageUploading ? (
                    <Loader2 size={20} className="animate-spin text-muted-foreground" />
                  ) : (
                    <Upload size={20} className="text-muted-foreground" />
                  )}
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
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
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

      {/* --- Delete confirm --- */}
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
    </AppLayout>
  )
}
