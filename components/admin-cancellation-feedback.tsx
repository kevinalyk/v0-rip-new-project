"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, MessageSquareOff } from "lucide-react"
import { format } from "date-fns"
import { CANCELLATION_REASONS } from "@/components/cancellation-feedback-fields"

type FeedbackEntry = {
  id: string
  clientId: string
  clientName: string
  userEmail: string | null
  subscriptionType: string
  plan: string
  reason: string
  comment: string | null
  createdAt: string
}

const REASON_LABELS: Record<string, string> = Object.fromEntries(
  CANCELLATION_REASONS.map((r) => [r.value, r.label]),
)

const REASON_COLORS: Record<string, string> = {
  too_expensive: "bg-red-500/15 text-red-400 border-red-500/30",
  not_using: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  missing_features: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  switching_competitor: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  poor_support: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  other: "bg-muted text-muted-foreground border-border",
}

export function AdminCancellationFeedback() {
  const [entries, setEntries] = useState<FeedbackEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filterReason, setFilterReason] = useState<string>("all")

  useEffect(() => {
    const fetchEntries = async () => {
      setLoading(true)
      try {
        const res = await fetch("/api/admin/cancellation-feedback", { credentials: "include" })
        const data = await res.json()
        setEntries(data.entries ?? [])
      } finally {
        setLoading(false)
      }
    }
    fetchEntries()
  }, [])

  const filteredEntries = useMemo(
    () => (filterReason === "all" ? entries : entries.filter((e) => e.reason === filterReason)),
    [entries, filterReason],
  )

  const reasonCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const entry of entries) {
      counts[entry.reason] = (counts[entry.reason] ?? 0) + 1
    }
    return counts
  }, [entries])

  const topReason = useMemo(() => {
    const sorted = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])
    return sorted.length > 0 ? sorted[0] : null
  }, [reasonCounts])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Cancellation Feedback</h2>
        <p className="text-muted-foreground">Why clients cancel, collected at the moment they confirm</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total responses</CardDescription>
            <CardTitle className="text-2xl">{entries.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Top reason</CardDescription>
            <CardTitle className="text-2xl">
              {topReason ? REASON_LABELS[topReason[0]] ?? topReason[0] : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>With written comments</CardDescription>
            <CardTitle className="text-2xl">{entries.filter((e) => e.comment).length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Responses</CardTitle>
            <CardDescription>Newest first</CardDescription>
          </div>
          <Select value={filterReason} onValueChange={setFilterReason}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by reason" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reasons</SelectItem>
              {CANCELLATION_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <MessageSquareOff className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No cancellation feedback yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead>Cancelled by</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.clientName}</TableCell>
                    <TableCell className="capitalize">
                      {entry.subscriptionType === "ci" ? "CI Add-on" : entry.plan}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={REASON_COLORS[entry.reason] ?? ""}>
                        {REASON_LABELS[entry.reason] ?? entry.reason}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[320px] text-sm text-muted-foreground">
                      {entry.comment || <span className="italic">No comment</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{entry.userEmail ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(entry.createdAt), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
