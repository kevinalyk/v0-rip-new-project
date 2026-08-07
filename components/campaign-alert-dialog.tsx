"use client"

import { useState, useEffect, useCallback } from "react"
import { Bell, BellPlus, Trash2, X, Plus, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { STATES, PARTIES, OFFICES } from "@/lib/campaign-filter-options"

interface CampaignAlert {
  id: string
  name: string
  party: string | null
  state: string | null
  office: string | null
  createdAt: string
}

function criteriaLabel(alert: CampaignAlert): string {
  const parts: string[] = []
  if (alert.party) parts.push(alert.party.charAt(0).toUpperCase() + alert.party.slice(1))
  if (alert.office) {
    const match = OFFICES.find((o) => o.value === alert.office)
    if (match) parts.push(match.label)
  }
  if (alert.state) parts.push(alert.state)
  return parts.length > 0 ? parts.join(" · ") : "Any campaign"
}

export default function CampaignAlertDialog() {
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState<CampaignAlert[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saved, setSaved] = useState(false)

  // Form state
  const [name, setName] = useState("")
  const [party, setParty] = useState("")
  const [state, setState] = useState("")
  const [office, setOffice] = useState("")
  const [formError, setFormError] = useState("")

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/campaign-alerts", { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setAlerts(data.alerts ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchAlerts()
  }, [open, fetchAlerts])

  function resetForm() {
    setName("")
    setParty("")
    setState("")
    setOffice("")
    setFormError("")
    setShowForm(false)
  }

  async function handleSave() {
    setFormError("")
    if (!name.trim()) {
      setFormError("Please give this alert a name.")
      return
    }
    if (!party && !state && !office) {
      setFormError("Select at least one criteria — party, state, or office.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/campaign-alerts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), party: party || null, state: state || null, office: office || null }),
      })
      if (!res.ok) {
        const err = await res.json()
        setFormError(err.error ?? "Failed to save alert.")
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      resetForm()
      fetchAlerts()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await fetch(`/api/campaign-alerts/${id}`, { method: "DELETE", credentials: "include" })
      setAlerts((prev) => prev.filter((a) => a.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-8 px-3 text-xs font-medium border-border text-foreground hover:bg-accent"
      >
        <Bell className="h-3.5 w-3.5" />
        Email Alerts
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#EB3847]" />
              Campaign Launch Alerts
            </DialogTitle>
            <DialogDescription>
              Get emailed when new campaigns matching your criteria are filed with the FEC.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Existing alerts list */}
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : alerts.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your alerts</p>
                <div className="space-y-1.5">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight truncate">{alert.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{criteriaLabel(alert)}</p>
                      </div>
                      <button
                        onClick={() => handleDelete(alert.id)}
                        disabled={deletingId === alert.id}
                        className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                        aria-label="Delete alert"
                      >
                        {deletingId === alert.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />
                        }
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : !showForm ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <BellPlus className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No alerts yet. Create one below.</p>
              </div>
            ) : null}

            {/* New alert form */}
            {showForm ? (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New alert</p>

                <div className="space-y-1.5">
                  <Label htmlFor="alert-name" className="text-xs">Alert name <span className="text-[#EB3847]">*</span></Label>
                  <Input
                    id="alert-name"
                    placeholder="e.g. Republican Senate in Alabama"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>

                <p className="text-xs text-muted-foreground">Select at least one criteria — all are optional individually.</p>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Party</Label>
                    <select
                      value={party}
                      onChange={(e) => setParty(e.target.value)}
                      className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Any</option>
                      {PARTIES.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">State</Label>
                    <select
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Any</option>
                      {STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Office</Label>
                    <select
                      value={office}
                      onChange={(e) => setOffice(e.target.value)}
                      className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Any</option>
                      {OFFICES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {formError && (
                  <p className="text-xs text-destructive">{formError}</p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className="h-8 text-xs bg-[#EB3847] hover:bg-[#EB3847]/90 text-white"
                  >
                    {saving
                      ? <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Saving…</>
                      : saved
                      ? <><CheckCircle2 className="h-3 w-3 mr-1.5" />Saved!</>
                      : "Save alert"
                    }
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetForm}
                    className="h-8 text-xs"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowForm(true)}
                className="w-full h-9 text-xs border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add new alert
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
