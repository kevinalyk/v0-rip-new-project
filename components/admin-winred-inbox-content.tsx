"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Search, Mail, RefreshCw, Inbox, AlertTriangle } from "lucide-react"
import { format } from "date-fns"

interface WinRedMessage {
  id: string
  seedEmailAddress: string
  subject: string | null
  senderName: string | null
  senderEmail: string | null
  placement: "inbox" | "spam"
  preview: string | null
  receivedAt: string
}

export function AdminWinRedInboxContent() {
  const [messages, setMessages] = useState<WinRedMessage[]>([])
  const [seedEmails, setSeedEmails] = useState<string[]>([])
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [search, setSearch] = useState("")
  const [seedFilter, setSeedFilter] = useState("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/winred-inbox", { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
        setSeedEmails(data.seedEmails || [])
        setLastScannedAt(data.lastScannedAt || null)
      }
    } catch (err) {
      console.error("Failed to fetch WinRed inbox messages:", err)
    } finally {
      setLoading(false)
    }
  }

  const runScanNow = async () => {
    setScanning(true)
    try {
      const res = await fetch("/api/admin/winred-inbox", { method: "POST", credentials: "include" })
      if (res.ok) {
        await fetchData()
      }
    } catch (err) {
      console.error("Failed to trigger WinRed inbox scan:", err)
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filtered = useMemo(() => {
    return messages.filter((m) => {
      if (seedFilter !== "all" && m.seedEmailAddress !== seedFilter) return false
      if (!search) return true
      const haystack = `${m.subject || ""} ${m.senderName || ""} ${m.senderEmail || ""}`.toLowerCase()
      return haystack.includes(search.toLowerCase())
    })
  }, [messages, search, seedFilter])

  const inboxCount = messages.filter((m) => m.placement === "inbox").length
  const spamCount = messages.filter((m) => m.placement === "spam").length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WinRed Inbox</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Internal RIP test seeds used to check WinRed mail deliverability. Scanned automatically once a day.
          </p>
        </div>
        <Button onClick={runScanNow} disabled={scanning} variant="outline" className="gap-2">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {scanning ? "Scanning..." : "Scan Now"}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Messages</CardDescription>
            <CardTitle className="text-3xl">{messages.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Last scanned {lastScannedAt ? format(new Date(lastScannedAt), "MMM d, yyyy h:mm a") : "never"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Inbox</CardDescription>
            <CardTitle className="text-3xl">{inboxCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Landed in the primary inbox</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Spam / Junk</CardDescription>
            <CardTitle className="text-3xl">{spamCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Filtered into spam or junk</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search subject or sender..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={seedFilter} onValueChange={setSeedFilter}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Filter by seed email" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All seed emails</SelectItem>
            {seedEmails.map((email) => (
              <SelectItem key={email} value={email}>
                {email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading WinRed inbox messages...</span>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-32">Placement</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Seed Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sender</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Subject</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-40">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((m) => (
                <Fragment key={m.id}>
                  <tr
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                  >
                    <td className="px-4 py-3">
                      {m.placement === "inbox" ? (
                        <Badge variant="secondary" className="gap-1 bg-green-100 text-green-700 hover:bg-green-100">
                          <Inbox className="h-3 w-3" />
                          Inbox
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 bg-red-100 text-red-700 hover:bg-red-100">
                          <AlertTriangle className="h-3 w-3" />
                          Spam
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-mono text-xs">{m.seedEmailAddress}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs">
                        <div className="font-medium">{m.senderName || "(no name)"}</div>
                        <div className="text-muted-foreground">{m.senderEmail}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[320px] truncate">{m.subject || "(no subject)"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(m.receivedAt), "MMM d, h:mm a")}
                    </td>
                  </tr>
                  {expandedId === m.id && m.preview && (
                    <tr className="bg-muted/20">
                      <td colSpan={5} className="px-4 py-3">
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{m.preview}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No messages found yet. Click &quot;Scan Now&quot; to check the inboxes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
