"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Search, Mail, Inbox, AlertTriangle, Smartphone } from "lucide-react"
import { format, subDays } from "date-fns"

interface SeedStat {
  email: string
  provider: string
  total: number
  inbox: number
  spam: number
  inboxPct: number | null
  spamPct: number | null
}

interface PhoneStat {
  phoneNumber: string
  total: number
}

function PlacementBar({ inboxPct, spamPct }: { inboxPct: number | null; spamPct: number | null }) {
  if (inboxPct === null || spamPct === null) {
    return <span className="text-xs text-muted-foreground">No placement data</span>
  }
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full flex">
          <div className="bg-green-500 h-full" style={{ width: `${inboxPct}%` }} />
          <div className="bg-red-400 h-full" style={{ width: `${spamPct}%` }} />
        </div>
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {inboxPct}% inbox / {spamPct}% spam
      </span>
    </div>
  )
}

export function AdminSeedInsightsContent() {
  const [seeds, setSeeds] = useState<SeedStat[]>([])
  const [phones, setPhones] = useState<PhoneStat[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [phoneSearch, setPhoneSearch] = useState("")
  const [from, setFrom] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"))
  const [to, setTo] = useState(() => format(new Date(), "yyyy-MM-dd"))

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/seed-insights?from=${from}T00:00:00Z&to=${to}T23:59:59Z`, {
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        setSeeds(data.emails || [])
        setPhones(data.phones || [])
      }
    } catch (err) {
      console.error("Failed to fetch seed insights:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [from, to])

  const filtered = seeds.filter((s) => s.email.toLowerCase().includes(search.toLowerCase()))
  const filteredPhones = phones.filter((p) => p.phoneNumber.includes(phoneSearch))
  const totalCampaigns = seeds.reduce((sum, s) => sum + s.total, 0)
  const totalSmsMessages = phones.reduce((sum, p) => sum + p.total, 0)
  const activeSeedCount = seeds.filter((s) => s.total > 0).length
  const activePhoneCount = phones.filter((p) => p.total > 0).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Seed Insights</h1>
        <p className="text-sm text-muted-foreground mt-1">
          See how many CI campaigns each seed email and phone number is receiving.
        </p>
      </div>

      {/* Date filter - applies to both tabs */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>From</span>
        <Input
          type="date"
          className="w-36 text-sm"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span>to</span>
        <Input
          type="date"
          className="w-36 text-sm"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>

      <Tabs defaultValue="emails" className="space-y-6">
        <TabsList>
          <TabsTrigger value="emails" className="gap-2">
            <Mail className="h-4 w-4" />
            Email Seeds
          </TabsTrigger>
          <TabsTrigger value="phones" className="gap-2">
            <Smartphone className="h-4 w-4" />
            Phone Numbers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="emails" className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Seeds</CardDescription>
                <CardTitle className="text-3xl">{seeds.length}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">CI seed accounts</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Seeds</CardDescription>
                <CardTitle className="text-3xl">{activeSeedCount}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Received at least 1 campaign</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Detections</CardDescription>
                <CardTitle className="text-3xl">{totalCampaigns.toLocaleString()}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Campaigns seen across all seeds</p>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by email address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading seed insights...</span>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Seed Email</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground w-24">Provider</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground w-28">Campaigns</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Inbox / Spam</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((s) => (
                    <tr key={s.email} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-mono text-xs">{s.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground text-xs">{s.provider}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {s.total === 0
                            ? <span className="text-muted-foreground">0</span>
                            : <span className="font-medium">{s.total.toLocaleString()}</span>
                          }
                        </div>
                      </td>
                      <td className="px-4 py-3 min-w-[200px]">
                        <PlacementBar inboxPct={s.inboxPct} spamPct={s.spamPct} />
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground text-sm">
                        No seed emails found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="phones" className="space-y-6">
          {/* Summary cards for phones */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Phone Numbers</CardDescription>
                <CardTitle className="text-3xl">{phones.length}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Receiving phone numbers</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Numbers</CardDescription>
                <CardTitle className="text-3xl">{activePhoneCount}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Received at least 1 SMS</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total SMS</CardDescription>
                <CardTitle className="text-3xl">{totalSmsMessages.toLocaleString()}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">SMS messages received</p>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by phone number..."
              value={phoneSearch}
              onChange={(e) => setPhoneSearch(e.target.value)}
            />
          </div>

          {/* Phone table */}
          {loading ? (
            <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading phone insights...</span>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Phone Number</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground w-28">SMS Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPhones.map((p) => (
                    <tr key={p.phoneNumber} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-mono text-xs">{p.phoneNumber}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{p.total.toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                  {filteredPhones.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-4 py-12 text-center text-muted-foreground text-sm">
                        No phone numbers found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
