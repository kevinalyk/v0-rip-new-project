"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
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
import { Loader2, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface DigestArticle {
  id: string
  slug: string
  title: string
  summary: string | null
  body: string
  imageUrl: string | null
  tags: string[] | null
  publishedAt: string
  createdBy: string
  updatedAt: string
}

interface DigestPageClientProps {
  initialArticles: DigestArticle[]
}

export default function DigestPageClient({ initialArticles: _ }: DigestPageClientProps) {
  const { toast } = useToast()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Delete state — super admins can delete from the list page
  const [deleteTarget, setDeleteTarget] = useState<DigestArticle | null>(null)
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

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/digest/${deleteTarget.id}`, { method: "DELETE", credentials: "include" })
      if (res.ok) {
        toast({ title: "Article deleted" })
        setDeleteTarget(null)
        window.location.reload()
      } else {
        toast({ title: "Error", description: "Failed to delete article", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" })
    } finally {
      setDeleting(false)
    }
  }

  if (authLoading) return null
  const isSuperAdmin = userRole === "super_admin"
  if (!isSuperAdmin) return null

  return (
    <>
      {/* Floating "New Article" button — super admins only, articles are published via API */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          className="bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white gap-2 shadow-lg"
          onClick={() => toast({ title: "Use the Claude API to publish articles", description: "POST /api/v1/digest with your DIGEST_API_KEY" })}
        >
          <Plus size={15} />
          New Article
        </Button>
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Article</AlertDialogTitle>
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
