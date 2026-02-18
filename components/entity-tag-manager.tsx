"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LucideTag, Plus, X, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface EntityTagManagerProps {
  entityId: string
  entityName: string
  currentTags: Array<{ tagName: string; tagColor: string }>
  onTagsUpdated: () => void
}

interface Tag {
  name: string
  color: string
  count: number
  entities: Array<{ id: string; name: string }>
}

export function EntityTagManager({ entityId, entityName, currentTags, onTagsUpdated }: EntityTagManagerProps) {
  const { toast } = useToast()
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newTagName, setNewTagName] = useState("")
  const [loading, setLoading] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchAllTags()
    }
  }, [isOpen])

  const fetchAllTags = async () => {
    try {
      const response = await fetch("/api/entity-tags")
      if (response.ok) {
        const data = await response.json()
        setAllTags(data.tags || [])
      }
    } catch (error) {
      console.error("Error fetching tags:", error)
    }
  }

  const handleAddTag = async (tagName: string) => {
    setLoading(true)
    try {
      const response = await fetch("/api/entity-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId, tagName }),
      })

      if (response.ok) {
        toast({
          title: "Tag added",
          description: `Added "${tagName}" to ${entityName}`,
        })
        onTagsUpdated()
        setIsOpen(false)
      } else {
        const data = await response.json()
        toast({
          title: "Error",
          description: data.error || "Failed to add tag",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add tag",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveTag = async (tagName: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/entity-tags?entityId=${entityId}&tagName=${encodeURIComponent(tagName)}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "Tag removed",
          description: `Removed "${tagName}" from ${entityName}`,
        })
        onTagsUpdated()
      } else {
        toast({
          title: "Error",
          description: "Failed to remove tag",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove tag",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim() || newTagName.length > 50) {
      toast({
        title: "Invalid tag name",
        description: "Tag name must be between 1 and 50 characters",
        variant: "destructive",
      })
      return
    }

    await handleAddTag(newTagName.trim())
    setNewTagName("")
    setShowCreateDialog(false)
    setIsCreating(false)
  }

  const currentTagNames = currentTags.map((t) => t.tagName)
  const availableTags = allTags.filter((t) => !currentTagNames.includes(t.name))

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <LucideTag className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs font-medium">Manage Tags for {entityName}</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {currentTags.length > 0 && (
            <>
              <div className="px-2 py-1.5">
                <p className="text-xs font-medium text-muted-foreground mb-2">Current Tags</p>
                <div className="flex flex-wrap gap-1">
                  {currentTags.map((tag) => (
                    <Badge
                      key={tag.tagName}
                      variant="outline"
                      className="text-xs pr-1"
                      style={{
                        backgroundColor: `${tag.tagColor}15`,
                        borderColor: tag.tagColor,
                        color: tag.tagColor,
                      }}
                    >
                      {tag.tagName}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 ml-1 hover:bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveTag(tag.tagName)
                        }}
                        disabled={loading}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>
              <DropdownMenuSeparator />
            </>
          )}

          {availableTags.length > 0 && (
            <>
              <div className="px-2 py-1.5">
                <p className="text-xs font-medium text-muted-foreground mb-2">Add Tag</p>
                {availableTags.map((tag) => (
                  <DropdownMenuItem
                    key={tag.name}
                    onClick={() => handleAddTag(tag.name)}
                    disabled={loading}
                    className="cursor-pointer"
                  >
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{
                        backgroundColor: `${tag.color}15`,
                        borderColor: tag.color,
                        color: tag.color,
                      }}
                    >
                      {tag.name}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">({tag.count})</span>
                  </DropdownMenuItem>
                ))}
              </div>
              <DropdownMenuSeparator />
            </>
          )}

          {allTags.length < 5 && (
            <DropdownMenuItem onClick={() => setShowCreateDialog(true)} disabled={loading} className="cursor-pointer">
              <Plus className="h-4 w-4 mr-2" />
              Create New Tag
            </DropdownMenuItem>
          )}

          {allTags.length >= 5 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Tag limit reached (5 max)</div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Tag</DialogTitle>
            <DialogDescription>
              Enter a name for your new tag (max 50 characters). You can create up to 5 unique tags.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Tag name..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              maxLength={50}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateTag()
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTag} disabled={loading || !newTagName.trim()}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Tag
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
