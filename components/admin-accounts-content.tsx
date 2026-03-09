"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Search, Users, CheckCircle, XCircle, Building2 } from "lucide-react"
import { format } from "date-fns"

interface ClientRow {
  id: string
  name: string
  slug: string
  active: boolean
  subscriptionPlan: string
  subscriptionStatus: string
  hasCompetitiveInsights: boolean
  emailVolumeLimit: number
  emailVolumeUsed: number
  subscriptionRenewDate: string | null
  cancelAtPeriodEnd: boolean
  totalUsers: number
  createdAt: string
  stripeCustomerId: string | null
  tier: { label: string; color: string }
  ownerName: string | null
  ownerEmail: string | null
}

function TierBadge({ tier }: { tier: { label: string; color: string } }) {
  const colorMap: Record<string, string> = {
    secondary: "bg-muted text-muted-foreground",
    default: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    destructive: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    outline: "bg-muted text-muted-foreground border border-border",
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[tier.color] ?? colorMap.outline}`}>
      {tier.label}
    </span>
  )
}

export function AdminAccountsContent() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const res = await fetch("/api/admin/all-clients", { credentials: "include" })
        if (res.ok) setClients(await res.json())
      } catch (err) {
        console.error("Failed to fetch clients:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchClients()
  }, [])

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      (c.ownerEmail ?? "").toLowerCase().includes(q) ||
      (c.ownerName ?? "").toLowerCase().includes(q)
    )
  })

  // Summary stats
  const totalActive = clients.filter((c) => c.active).length
  const tierCounts = clients.reduce<Record<string, number>>((acc, c) => {
    acc[c.tier.label] = (acc[c.tier.label] ?? 0) + 1
    return acc
  }, {})
  const ciCount = clients.filter((c) => c.hasCompetitiveInsights).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><Building2 className="h-4 w-4" /> Total Accounts</CardDescription>
            <CardTitle className="text-3xl">{clients.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{totalActive} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Free</CardDescription>
            <CardTitle className="text-3xl">{tierCounts["Free"] ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">accounts on free tier</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Basic</CardDescription>
            <CardTitle className="text-3xl">{tierCounts["Basic"] ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">accounts on basic tier</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Professional</CardDescription>
            <CardTitle className="text-3xl">{tierCounts["Professional"] ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{ciCount} with CI add-on</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by account name, slug, or owner..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Account</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Owner</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tier</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">CI</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Users</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email Usage</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Renews</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.slug}</div>
                </td>
                <td className="px-4 py-3">
                  {c.ownerName ? (
                    <>
                      <div>{c.ownerName}</div>
                      <div className="text-xs text-muted-foreground">{c.ownerEmail}</div>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <TierBadge tier={c.tier} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {c.active ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <span className={c.active ? "text-green-600" : "text-destructive"}>
                      {c.active ? "Active" : "Inactive"}
                    </span>
                    {c.cancelAtPeriodEnd && (
                      <Badge variant="outline" className="text-xs ml-1">Cancelling</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">{c.subscriptionStatus}</div>
                </td>
                <td className="px-4 py-3">
                  {c.hasCompetitiveInsights ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground/40" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {c.totalUsers}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs">
                    {c.emailVolumeUsed.toLocaleString()} / {c.emailVolumeLimit.toLocaleString()}
                  </div>
                  <div className="mt-1 h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(100, (c.emailVolumeUsed / c.emailVolumeLimit) * 100)}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {c.subscriptionRenewDate
                    ? format(new Date(c.subscriptionRenewDate), "MMM d, yyyy")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {format(new Date(c.createdAt), "MMM d, yyyy")}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                  No accounts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Showing {filtered.length} of {clients.length} accounts</p>
    </div>
  )
}
