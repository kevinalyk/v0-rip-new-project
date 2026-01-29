"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Eye, Save, Trash2, ChevronDown, Loader2 } from "lucide-react"
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

interface CiView {
  id: string
  name: string
  filterSettings: any
  createdAt: string
  updatedAt: string
}

interface CiViewsManagerProps {
  clientSlug: string
  currentFilters: any
  onLoadView: (filterSettings: any) => void
  hasActiveFilters: boolean
}

export function CiViewsManager({ clientSlug, currentFilters, onLoadView, hasActiveFilters }: CiViewsManagerProps) {
  const { toast } = useToast()
  const [views, setViews] = useState<CiView[]>([])
  const [loading, setLoading] = useState(true)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [viewName, setViewName] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [viewToDelete, setViewToDelete] = useState<CiView | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchViews = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/ci-views?clientSlug=${clientSlug}`)
      if (response.ok) {
        const data = await response.json()
        setViews(data.views || [])
      }
    } catch (error) {
      console.error("Error fetching views:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchViews()
  }, [clientSlug])

  const handleSaveView = async () => {
    if (!viewName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for this view.",
        variant: "destructive",
      })
      return
    }

    try {
      setSaving(true)
      const response = await fetch("/api/ci-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: viewName,
          filterSettings: currentFilters,
          clientSlug,
        }),
      })

      if (response.ok) {
        toast({
          title: "View saved",
          description: `"${viewName}" has been saved successfully.`,
        })
        setSaveDialogOpen(false)
        setViewName("")
        fetchViews()
      } else {
        const data = await response.json()
        toast({
          title: "Error",
          description: data.error || "Failed to save view",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error saving view:", error)
      toast({
        title: "Error",
        description: "An error occurred while saving the view",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteView = async () => {
    if (!viewToDelete) return

    try {
      setDeleting(true)
      const response = await fetch(`/api/ci-views?id=${viewToDelete.id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "View deleted",
          description: `"${viewToDelete.name}" has been deleted.`,
        })
        setDeleteDialogOpen(false)
        setViewToDelete(null)
        fetchViews()
      } else {
        const data = await response.json()
        toast({
          title: "Error",
          description: data.error || "Failed to delete view",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error deleting view:", error)
      toast({
        title: "Error",
        description: "An error occurred while deleting the view",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleLoadView = (view: CiView) => {
    onLoadView(view.filterSettings)
    toast({
      title: "View loaded",
      description: `Applied filters from "${view.name}"`,
    })
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)} className="gap-2">
            <Save className="h-4 w-4" />
            Save View
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 bg-transparent">
              <Eye className="h-4 w-4" />
              Views
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Saved Views</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : views.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground text-center">No saved views yet</div>
            ) : (
              views.map((view) => (
                <DropdownMenuItem
                  key={view.id}
                  className="flex items-center justify-between cursor-pointer"
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="flex-1 cursor-pointer" onClick={() => handleLoadView(view)}>
                    {view.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      setViewToDelete(view)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Current View</DialogTitle>
            <DialogDescription>
              Give this filter configuration a name so you can quickly apply it later. All users in your organization
              will be able to use this view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">View Name</Label>
              <Input
                id="view-name"
                placeholder="e.g., High Priority Republicans, This Month"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !saving) {
                    handleSaveView()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveView} disabled={saving || !viewName.trim()}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save View"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete View</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{viewToDelete?.name}"? This action cannot be undone and will affect all
              users in your organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteView}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
