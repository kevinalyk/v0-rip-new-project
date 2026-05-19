"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Pencil, Trash2, Plus, Copy, Check } from "lucide-react"

type ChangelogEntry = {
  id: string
  title: string
  description: string
  category: string
  plan: string | null
  publishedAt: string
  createdAt: string
}

const CATEGORIES = ["feature", "improvement", "fix", "admin"] as const
const PLANS = ["all_users", "all", "enterprise"] as const

const CATEGORY_COLORS: Record<string, string> = {
  feature:     "bg-blue-500/15 text-blue-400 border-blue-500/30",
  improvement: "bg-green-500/15 text-green-400 border-green-500/30",
  fix:         "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  admin:       "bg-purple-500/15 text-purple-400 border-purple-500/30",
}

const PLAN_LABELS: Record<string, string> = {
  all_users:  "All Users",
  all:        "Professional",
  enterprise: "Enterprise",
}

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "feature" as string,
  plan: "" as string,
  publishedAt: new Date().toISOString().slice(0, 10),
}

export function AdminChangelog() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>("all")

  const fetchEntries = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/changelog", { credentials: "include" })
      const data = await res.json()
      setEntries(data.entries ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchEntries() }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, publishedAt: new Date().toISOString().slice(0, 10) })
    setDialogOpen(true)
  }

  const openEdit = (entry: ChangelogEntry) => {
    setEditingId(entry.id)
    setForm({
      title: entry.title,
      description: entry.description,
      category: entry.category,
      plan: entry.plan ?? "",
      publishedAt: entry.publishedAt.slice(0, 10),
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.description.trim()) return
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        description: form.description,
        category: form.category,
        plan: form.plan || null,
        publishedAt: form.publishedAt,
      }
      if (editingId) {
        await fetch(`/api/admin/changelog/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        })
      } else {
        await fetch("/api/admin/changelog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        })
      }
      setDialogOpen(false)
      fetchEntries()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await fetch(`/api/admin/changelog/${id}`, { method: "DELETE", credentials: "include" })
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const handleCopyForClaude = () => {
    const filtered = filterCategory === "all" ? entries : entries.filter((e) => e.category === filterCategory)
    const text = filtered.map((e) => {
      const date = new Date(e.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      const planLabel = e.plan ? ` [${PLAN_LABELS[e.plan] ?? e.plan}]` : ""
      return `## ${e.title}${planLabel}\nDate: ${date} | Category: ${e.category}\n\n${e.description}`
    }).join("\n\n---\n\n")
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const filtered = filterCategory === "all" ? entries : entries.filter((e) => e.category === filterCategory)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Product Changelog</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track new features, improvements, and fixes. Copy for Claude to generate blog posts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyForClaude} className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied!" : "Copy for Claude"}
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New Entry
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        {["all", ...CATEGORIES].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filterCategory === cat
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-2">{filtered.length} {filtered.length === 1 ? "entry" : "entries"}</span>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          <span className="animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground text-sm">
          No changelog entries yet. Click &quot;New Entry&quot; to add one.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border bg-card p-5 group">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Title row */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <h3 className="font-semibold text-foreground text-sm">{entry.title}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${CATEGORY_COLORS[entry.category] ?? "bg-muted text-muted-foreground border-border"}`}>
                      {entry.category}
                    </span>
                    {entry.plan && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-muted/50 text-muted-foreground border-border">
                        {PLAN_LABELS[entry.plan] ?? entry.plan}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  {/* Description */}
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{entry.description}</p>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(entry)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(entry.id)}
                    disabled={deletingId === entry.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Changelog Entry" : "New Changelog Entry"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cl-title">Title</Label>
              <Input
                id="cl-title"
                placeholder="e.g. Email Headers view for Professional plan"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cl-description">
                Description
                <span className="text-muted-foreground font-normal ml-1 text-xs">(write as if explaining to a user — Claude will read this)</span>
              </Label>
              <Textarea
                id="cl-description"
                placeholder="Describe the change in plain English. Include what it does, who it's for, and why it's useful..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={6}
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Plan <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <Select value={form.plan || "none"} onValueChange={(v) => setForm((f) => ({ ...f, plan: v === "none" ? "" : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">All users</SelectItem>
                    <SelectItem value="all">Professional</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cl-date">Date</Label>
                <Input
                  id="cl-date"
                  type="date"
                  value={form.publishedAt}
                  onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title.trim() || !form.description.trim()}>
              {saving ? "Saving..." : editingId ? "Save Changes" : "Create Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
