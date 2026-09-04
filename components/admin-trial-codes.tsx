"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Plus, Ticket } from "lucide-react"
import { toast } from "sonner"

interface TrialCode {
  id: string
  code: string
  label: string | null
  trialLengthDays: number
  active: boolean
  expiresAt: string | null
  createdAt: string
  redemptionCount: number
}

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Failed to load")
    }
    return res.json()
  })

function formatDate(value: string | null) {
  if (!value) return "Never"
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function isExpired(code: TrialCode) {
  return !!code.expiresAt && new Date(code.expiresAt) < new Date()
}

export function AdminTrialCodes() {
  const { data, isLoading, mutate } = useSWR<{ codes: TrialCode[] }>("/api/admin/trial-codes", fetcher)
  const [creating, setCreating] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [newCode, setNewCode] = useState("")
  const [newLabel, setNewLabel] = useState("")
  const [newTrialLengthDays, setNewTrialLengthDays] = useState("30")
  const [newExpiresAt, setNewExpiresAt] = useState("")

  const handleCreate = async () => {
    if (!newCode.trim()) {
      toast.error("Enter a code")
      return
    }

    setCreating(true)
    try {
      const response = await fetch("/api/admin/trial-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode,
          label: newLabel,
          trialLengthDays: newTrialLengthDays,
          expiresAt: newExpiresAt || undefined,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "Failed to create trial code")
      }

      toast.success(`Trial code "${result.code.code}" created`)
      setNewCode("")
      setNewLabel("")
      setNewTrialLengthDays("30")
      setNewExpiresAt("")
      mutate()
    } catch (err: any) {
      toast.error(err.message || "Failed to create trial code")
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActive = async (code: TrialCode) => {
    setTogglingId(code.id)
    try {
      const response = await fetch(`/api/admin/trial-codes/${code.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !code.active }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "Failed to update trial code")
      }
      toast.success(code.active ? `"${code.code}" deactivated` : `"${code.code}" reactivated`)
      mutate()
    } catch (err: any) {
      toast.error(err.message || "Failed to update trial code")
    } finally {
      setTogglingId(null)
    }
  }

  const codes = data?.codes ?? []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5" />
          <CardTitle>Trial Codes</CardTitle>
        </div>
        <CardDescription>
          Generate codes that grant new signups a full-featured trial (unlimited users, reporting, filters). Each
          code can be redeemed once per organization until you deactivate it or it expires.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-trial-code">Code</Label>
            <Input
              id="new-trial-code"
              placeholder="LAUNCH2026"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="w-40 uppercase placeholder:normal-case"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-trial-label">Label (internal note)</Label>
            <Input
              id="new-trial-label"
              placeholder="Spring conference giveaway"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-56"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-trial-length">Trial length (days)</Label>
            <Input
              id="new-trial-length"
              type="number"
              min={1}
              value={newTrialLengthDays}
              onChange={(e) => setNewTrialLengthDays(e.target.value)}
              className="w-28"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-trial-expires">Code expires (optional)</Label>
            <Input
              id="new-trial-expires"
              type="date"
              value={newExpiresAt}
              onChange={(e) => setNewExpiresAt(e.target.value)}
              className="w-44"
            />
          </div>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Code
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : codes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No trial codes yet — create one above.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Trial Length</TableHead>
                <TableHead>Redemptions</TableHead>
                <TableHead>Code Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((code) => {
                const expired = isExpired(code)
                return (
                  <TableRow key={code.id}>
                    <TableCell className="font-mono font-medium">{code.code}</TableCell>
                    <TableCell className="text-muted-foreground">{code.label || "—"}</TableCell>
                    <TableCell>{code.trialLengthDays} days</TableCell>
                    <TableCell>{code.redemptionCount}</TableCell>
                    <TableCell>{formatDate(code.expiresAt)}</TableCell>
                    <TableCell>
                      {expired ? (
                        <Badge variant="secondary">Expired</Badge>
                      ) : code.active ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="outline">Deactivated</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={code.active}
                        disabled={togglingId === code.id || expired}
                        onCheckedChange={() => handleToggleActive(code)}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
