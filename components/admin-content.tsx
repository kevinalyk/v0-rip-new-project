"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Play, X, Mail, MessageSquare, TrendingUp, CalendarIcon } from "lucide-react"
import { toast } from "sonner"
import { CampaignDetectionDialog } from "@/components/campaign-detection-dialog"
import { CompetitiveInsightsDetectionDialog } from "@/components/competitive-insights-detection-dialog"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Label } from "@/components/ui/label"

// Define AdminContentProps if it's not defined elsewhere
interface AdminContentProps {
  user?: any // Replace 'any' with the actual user type if known
}

interface DailyStats {
  date: string
  emails: number
  sms: number
  total: number
  emailsAvg: number
  smsAvg: number
  totalAvg: number
}

export function AdminContent({ user }: AdminContentProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [dateRange, setDateRange] = useState({ days: 30 })
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [isMigratingSMS, setIsMigratingSMS] = useState(false)
  const [isSanitizingEmails, setIsSanitizingEmails] = useState(false)
  const [isBackfillingSMSLinks, setIsBackfillingSMSLinks] = useState(false)
  const [isCleaningCTAParams, setIsCleaningCTAParams] = useState(false)
  const [isSanitizingSubjects, setIsSanitizingSubjects] = useState(false)
  const [isUnwrappingLinks, setIsUnwrappingLinks] = useState(false)
  const [isSanitizingEmailLinks, setIsSanitizingEmailLinks] = useState(false)
  const [isRedactingEmailLinks, setIsRedactingEmailLinks] = useState(false)
  const [redactCampaignId, setRedactCampaignId] = useState("")

  const [isAutoPopulatingWinRed, setIsAutoPopulatingWinRed] = useState(false)
  const [isAutoPopulatingAnedot, setIsAutoPopulatingAnedot] = useState(false)
  const [isAnalyzingActBlue, setIsAnalyzingActBlue] = useState(false)
  const [actBluePatterns, setActBluePatterns] = useState<any>(null)
  const [isReassigning, setIsReassigning] = useState(false)
  const [reassignmentResults, setReassignmentResults] = useState<any>(null)
  const [isUnassigning, setIsUnassigning] = useState(false)
  const [unassignResults, setUnassignResults] = useState<any>(null)
  const [isAssigningDataBrokers, setIsAssigningDataBrokers] = useState(false)
  const [dataBrokerAssignmentResults, setDataBrokerAssignmentResults] = useState<any>(null)
  const [isDailyGOPAssigning, setIsDailyGOPAssigning] = useState(false)
  const [dailyGOPResults, setDailyGOPResults] = useState<{
    summary: { total: number; assigned: number; noMatch: number }
    sampleAssignments: Array<{ campaign: string; entity: string; identifier: string }>
  } | null>(null)
  const [isLibertyMuseAssigning, setIsLibertyMuseAssigning] = useState(false)
  const [libertyMuseResults, setLibertyMuseResults] = useState<{
    success: boolean
    results: {
      total: number
      assignedToDataBroker: number
      assignedViaWinRed: number
      assignedViaAnedot: number
      noMatch: number
      assignments?: Array<{ campaign: string; entity: string; method: string }> // Added for sample assignments
    }
  } | null>(null)
  const [isStayInformedAssigning, setIsStayInformedAssigning] = useState(false)
  const [stayInformedResults, setStayInformedResults] = useState<{
    summary: { total: number; assigned: number; noMatch: number }
    sampleAssignments: Array<{ campaign: string; entity: string; identifier: string }>
  } | null>(null)
  const [isLibertyActionAssigning, setIsLibertyActionAssigning] = useState(false)
  const [libertyActionResults, setLibertyActionResults] = useState<{
    success: boolean
    results: {
      total: number
      assignedToDataBroker: number
      assignedViaWinRed: number
      assignedViaAnedot: number
      noMatch: number
      assignments?: Array<{ campaign: string; entity: string; method: string }> // Added for sample assignments
    }
  } | null>(null)
  const [isMagaDailyAssigning, setIsMagaDailyAssigning] = useState(false)
  const [magaDailyResults, setMagaDailyResults] = useState<{
    totalProcessed: number
    assignedCount: number
    skippedCount: number
    results: Array<{ campaignId: string; subject: string; action: string; entityName?: string }>
  } | null>(null)
  const [isOfficialTrumpTrackerAssigning, setIsOfficialTrumpTrackerAssigning] = useState(false)
  const [officialTrumpTrackerResults, setOfficialTrumpTrackerResults] = useState<{
    totalProcessed: number
    assignedCount: number
    skippedCount: number
    results: Array<{ campaignId: string; subject: string; action: string; entityName?: string }>
  } | null>(null)

  const [unwrapCampaignId, setUnwrapCampaignId] = useState("")
  const [isUnwrappingSingle, setIsUnwrappingSingle] = useState(false)
  const [unwrapResults, setUnwrapResults] = useState<{
    type: "email" | "sms"
    displayName: string
    details: Array<{ original: string; final: string; changed: boolean }>
  } | null>(null)

  // --- NEW STATE FOR SMS FIX ---
  const [isFixingSMS5417204415, setIsFixingSMS5417204415] = useState(false)
  const [smsFixResults, setSmsFixResults] = useState<{
    summary: { total: number; updated: number; skipped: number; errors: number }
    sampleResults: Array<{
      id: string
      oldPhone: string
      newPhone: string
      oldMessage: string
      newMessage: string
    }>
  } | null>(null)
  // --- END NEW STATE ---

  const [testUrl, setTestUrl] = useState("")
  const [isTestingUrl, setIsTestingUrl] = useState(false)
  const [testUrlResults, setTestUrlResults] = useState<{
    original: { url: string; stripped: string; hasQueryParams: boolean }
    redirectChain: {
      steps: Array<{
        step: number
        url: string
        status: number
        redirectType?: string
        timing: number
        htmlSnippet?: string
      }> // Added htmlSnippet
      totalSteps: number
      totalTime: number
      error?: string
    }
    final: { url: string; stripped: string; hasQueryParams: boolean; changed: boolean }
    summary: { originalUrl: string; finalUrl: string; redirects: number; totalTime: string; changed: boolean }
  } | null>(null)

  const [isAnalyzingPSQ, setIsAnalyzingPSQ] = useState(false)
  const [psqPatterns, setPsqPatterns] = useState<any>(null)

  const [isAutoAssigningSms, setIsAutoAssigningSms] = useState(false)
  const [smsAutoAssignResults, setSmsAutoAssignResults] = useState<{
    summary: { totalProcessed: number; urlsUnwrapped: number; smsAssigned: number }
    results: Array<{
      id: string
      phoneNumber: string | null
      originalUrl?: string
      unwrappedUrl?: string
      assigned: boolean
      entityName?: string
      error?: string
    }>
  } | null>(null)
  // </CHANGE>

  const [isBulkUnwrapping, setIsBulkUnwrapping] = useState(false)
  const [bulkUnwrapResults, setBulkUnwrapResults] = useState<any>(null)

  const [isAnalyzingPlatforms, setIsAnalyzingPlatforms] = useState(false)

  const [isAutoAssigningCampaigns, setIsAutoAssigningCampaigns] = useState(false)
  const [campaignsAutoAssignResults, setCampaignsAutoAssignResults] = useState<{
    summary: {
      totalEmails: number
      totalSms: number
      emailsAssigned: number
      smsAssigned: number
    }
    samples: {
      emails: Array<{ id: string; subject: string; entityName: string; identifier: string }>
      sms: Array<{ id: string; phoneNumber: string; entityName: string; identifier: string }>
    }
  } | null>(null)
  const [platformAnalysisResults, setPlatformAnalysisResults] = useState<{
    summary: {
      totalEmailCampaigns: number
      totalSmsMessages: number
      totalUniqueDomains: number
      totalLinkCount: number
    }
    domains: Array<{ domain: string; count: number }>
  } | null>(null)

  // Batch unwrap links state
  const [isBatchUnwrapping, setIsBatchUnwrapping] = useState(false)
  const [batchUnwrapCursor, setBatchUnwrapCursor] = useState<{
    lastEmailId: string | null
    lastSmsId: string | null
  }>({ lastEmailId: null, lastSmsId: null })
  const [batchUnwrapResults, setBatchUnwrapResults] = useState<{
    emails: {
      processed: number
      linksUnwrapped: number
      errors: Array<{ id: string; subject: string; error: string }>
      lastId: string | null
    }
    sms: {
      processed: number
      linksUnwrapped: number
      errors: Array<{ id: string; phone: string; error: string }>
      lastId: string | null
    }
    totals: { emails: number; sms: number }
    hasMore: boolean
    message: string
  } | null>(null)
  const [totalBatchesRun, setTotalBatchesRun] = useState(0)

  // Fetch message stats on component mount and when date range changes
  useEffect(() => {
    const fetchMessageStats = async () => {
      setLoadingStats(true)
      try {
        const params = new URLSearchParams()
        
        if (startDate && endDate) {
          params.append("startDate", startDate)
          params.append("endDate", endDate)
        } else {
          params.append("days", dateRange.days.toString())
        }

        const response = await fetch(`/api/admin/message-stats?${params.toString()}`)
        if (response.ok) {
          const data = await response.json()
          setDailyStats(data.dailyData)
        } else {
          console.error("Failed to fetch message stats")
          toast.error("Failed to fetch message stats")
        }
      } catch (error) {
        console.error("Error fetching message stats:", error)
        toast.error("Error fetching message stats")
      } finally {
        setLoadingStats(false)
      }
    }

    fetchMessageStats()
  }, [dateRange, startDate, endDate])

  const handleRunEngagement = async () => {
    setIsRunning(true)
    try {
      const response = await fetch("/api/debug/run-engagement", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(data.message || "Engagement simulation completed successfully")
      } else {
        toast.error(data.error || "Failed to run engagement simulation")
      }
    } catch (error) {
      toast.error("Failed to run engagement simulation")
    } finally {
      setIsRunning(false)
    }
  }

  const handleMigrateSMS = async () => {
    setIsMigratingSMS(true)
    try {
      const response = await fetch("/api/admin/migrate-sms", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(
          `SMS migration completed: ${data.summary.updated} updated, ${data.summary.skipped} skipped, ${data.summary.errors} errors`,
        )
      } else {
        toast.error(data.error || "Failed to run SMS migration")
      }
    } catch (error) {
      toast.error("Failed to run SMS migration")
    } finally {
      setIsMigratingSMS(false)
    }
  }

  const handleSanitizeEmails = async () => {
    setIsSanitizingEmails(true)
    try {
      const response = await fetch("/api/admin/sanitize-emails", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(
          `Email sanitization completed: ${data.summary.updated} updated, ${data.summary.skipped} skipped, ${data.summary.errors} errors`,
        )
      } else {
        toast.error(data.error || "Failed to sanitize emails")
      }
    } catch (error) {
      toast.error("Failed to sanitize emails")
    } finally {
      setIsSanitizingEmails(false)
    }
  }

  const handleBackfillSMSLinks = async () => {
    setIsBackfillingSMSLinks(true)
    try {
      const response = await fetch("/api/admin/backfill-sms-links", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(
          `SMS links backfill completed: ${data.summary.updated} updated, ${data.summary.skipped} skipped, ${data.summary.errors} errors`,
        )
      } else {
        toast.error(data.error || "Failed to backfill SMS links")
      }
    } catch (error) {
      toast.error("Failed to backfill SMS links")
    } finally {
      setIsBackfillingSMSLinks(false)
    }
  }

  const handleCleanCTAParams = async () => {
    setIsCleaningCTAParams(true)
    try {
      const response = await fetch("/api/admin/clean-cta-params", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(
          `CTA cleanup completed: ${data.summary.emailCampaignsUpdated} emails, ${data.summary.smsMessagesUpdated} SMS updated (${data.summary.totalUpdated} total)`,
        )
      } else {
        toast.error(data.error || "Failed to clean CTA parameters")
      }
    } catch (error) {
      toast.error("Failed to clean CTA parameters")
    } finally {
      setIsCleaningCTAParams(false)
    }
  }

  const handleSanitizeSubjects = async () => {
    setIsSanitizingSubjects(true)
    try {
      const response = await fetch("/api/admin/sanitize-subject-lines", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(
          `Subject sanitization completed: ${data.summary.updated} updated, ${data.summary.skipped} skipped, ${data.summary.errors} errors`,
        )
      } else {
        toast.error(data.error || "Failed to sanitize subject lines")
      }
    } catch (error) {
      toast.error("Failed to sanitize subject lines")
    } finally {
      setIsSanitizingSubjects(false)
    }
  }

  const handleUnwrapCTALinks = async () => {
    setIsUnwrappingLinks(true)
    try {
      const response = await fetch("/api/admin/unwrap-cta-links", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(
          `CTA unwrapping completed: ${data.summary.updated} updated, ${data.summary.skipped} skipped, ${data.summary.errors} errors`,
        )
      } else {
        toast.error(data.error || "Failed to unwrap CTA links")
      }
    } catch (error) {
      toast.error("Failed to unwrap CTA links")
    } finally {
      setIsUnwrappingLinks(false)
    }
  }

  const handleSanitizeEmailLinks = async () => {
    setIsSanitizingEmailLinks(true)
    try {
      const response = await fetch("/api/admin/sanitize-email-links", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(
          `Email links sanitized: ${data.summary.updated} updated, ${data.summary.skipped} skipped, ${data.summary.errors} errors`,
        )
      } else {
        toast.error(data.error || "Failed to sanitize email links")
      }
    } catch (error) {
      toast.error("Failed to sanitize email links")
    } finally {
      setIsSanitizingEmailLinks(false)
    }
  }

  const handleRedactEmailLinks = async () => {
    setIsRedactingEmailLinks(true)
    try {
      const response = await fetch("/api/admin/redact-email-links", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(redactCampaignId.trim() ? { campaignId: redactCampaignId.trim() } : {}),
      })
      const data = await response.json()
      if (response.ok) {
        toast.success(
          `Redacted links: ${data.summary.updated} updated, ${data.summary.skipped} skipped, ${data.summary.errors} errors`,
        )
      } else {
        toast.error(data.error || "Failed to redact email links")
      }
    } catch (error) {
      toast.error("Failed to redact email links")
    } finally {
      setIsRedactingEmailLinks(false)
    }
  }

  const handleAutoPopulateWinRed = async () => {
    setIsAutoPopulatingWinRed(true)
    try {
      const response = await fetch("/api/admin/auto-populate-winred", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(
          `WinRed identifier auto-population completed: ${data.summary.updated} updated, ${data.summary.skipped} skipped, ${data.summary.errors} errors`,
        )
      } else {
        toast.error(data.error || "Failed to auto-populate WinRed identifiers")
      }
    } catch (error) {
      toast.error("Failed to auto-populate WinRed identifiers")
    } finally {
      setIsAutoPopulatingWinRed(false)
    }
  }

  const handleAutoPopulateAnedot = async () => {
    setIsAutoPopulatingAnedot(true)
    try {
      const response = await fetch("/api/admin/auto-populate-anedot", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(
          `Anedot identifier auto-population completed: ${data.summary.updated} updated, ${data.summary.skipped} skipped, ${data.summary.errors} errors`,
        )
      } else {
        toast.error(data.error || "Failed to auto-populate Anedot identifiers")
      }
    } catch (error) {
      toast.error("Failed to auto-populate Anedot identifiers")
    } finally {
      setIsAutoPopulatingAnedot(false)
    }
  }

  const handleAnalyzeActBlue = async () => {
    setIsAnalyzingActBlue(true)
    setActBluePatterns(null)
    try {
      const response = await fetch("/api/admin/analyze-actblue-patterns", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        setActBluePatterns(data)
        toast.success(
          `ActBlue analysis completed: Found ${data.summary.totalPatterns} unique patterns with ${data.summary.totalOccurrences} total occurrences`,
        )
      } else {
        toast.error(data.error || "Failed to analyze ActBlue patterns")
      }
    } catch (error) {
      toast.error("Failed to analyze ActBlue patterns")
    } finally {
      setIsAnalyzingActBlue(false)
    }
  }

  const downloadActBluePatterns = () => {
    if (!actBluePatterns) return

    const csv = [
      ["Pattern", "Identifier", "Count", "Example URL"],
      ...actBluePatterns.patterns.map((p: any) => [p.pattern, p.identifier, p.count, p.fullUrl]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `actblue-patterns-${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleBulkReassign = async () => {
    setIsReassigning(true)
    setReassignmentResults(null)
    try {
      const response = await fetch("/api/admin/reassign-data-broker-campaigns", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        setReassignmentResults(data)
        toast.success(
          `Bulk reassignment completed: ${data.summary.reassigned} reassigned, ${data.summary.skipped} skipped, ${data.summary.errors} errors`,
        )
      } else {
        toast.error(data.error || "Failed to reassign campaigns")
      }
    } catch (error) {
      toast.error("Failed to reassign campaigns")
    } finally {
      setIsReassigning(false)
    }
  }

  const handleUnassignDataBrokers = async () => {
    if (!confirm("This will unassign ALL campaigns from data broker entities. Are you sure?")) {
      return
    }

    setIsUnassigning(true)
    setUnassignResults(null)
    try {
      const response = await fetch("/api/admin/unassign-data-broker-campaigns", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        setUnassignResults(data)
        toast.success(`Unassigned ${data.summary.unassigned} campaigns from ${data.summary.dataBrokers} data brokers`)
      } else {
        toast.error(data.error || "Failed to unassign campaigns")
      }
    } catch (error) {
      console.error("Error unassigning campaigns:", error)
      alert("Failed to unassign campaigns")
    } finally {
      setIsUnassigning(false)
    }
  }

  const handleAssignDataBrokers = async () => {
    if (
      !confirm(
        "This will scan unassigned campaigns from data broker domains and assign them based on link patterns and donation identifiers. Continue?",
      )
    ) {
      return
    }

    setIsAssigningDataBrokers(true)
    setDataBrokerAssignmentResults(null)

    try {
      const response = await fetch("/api/admin/assign-data-broker-unassigned", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to assign data broker campaigns")
      }

      const data = await response.json()
      setDataBrokerAssignmentResults(data.results)
    } catch (error) {
      console.error("Error assigning data broker campaigns:", error)
      alert("Failed to assign data broker campaigns")
    } finally {
      setIsAssigningDataBrokers(false)
    }
  }

  const handleAssignDailyGOPNews = async () => {
    if (!confirm("Assign unassigned Daily GOP News campaigns based on WinRed identifiers?")) {
      return
    }

    setIsDailyGOPAssigning(true)
    setDailyGOPResults(null)

    try {
      const response = await fetch("/api/admin/assign-daily-gop-news", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to assign Daily GOP News campaigns")
      }

      const data = await response.json()
      setDailyGOPResults(data)
      toast.success(`Assigned ${data.summary.assigned} of ${data.summary.total} Daily GOP News campaigns`)
    } catch (error) {
      console.error("Error assigning Daily GOP News campaigns:", error)
      toast.error("Failed to assign Daily GOP News campaigns")
    } finally {
      setIsDailyGOPAssigning(false)
    }
  }

  const handleAssignLibertyMuse = async () => {
    if (
      !confirm("Assign unassigned American Liberty Muse campaigns based on newsletter patterns and WinRed identifiers?")
    ) {
      return
    }

    setIsLibertyMuseAssigning(true)
    setLibertyMuseResults(null)

    try {
      const response = await fetch("/api/admin/assign-american-liberty-muse", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to assign American Liberty Muse campaigns")
      }

      const data = await response.json()
      setLibertyMuseResults(data)
      const totalAssigned =
        data.results.assignedToDataBroker + data.results.assignedViaWinRed + data.results.assignedViaAnedot
      toast.success(`Assigned ${totalAssigned} of ${data.results.total} American Liberty Muse campaigns`)
    } catch (error) {
      console.error("Error assigning American Liberty Muse campaigns:", error)
      toast.error("Failed to assign American Liberty Muse campaigns")
    } finally {
      setIsLibertyMuseAssigning(false)
    }
  }

  const handleAssignStayInformedNow = async () => {
    if (!confirm("Assign unassigned Stay Informed Now campaigns based on WinRed identifiers?")) {
      return
    }

    setIsStayInformedAssigning(true)
    setStayInformedResults(null)

    try {
      const response = await fetch("/api/admin/assign-stay-informed-now", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to assign Stay Informed Now campaigns")
      }

      const data = await response.json()
      setStayInformedResults(data)
      toast.success(`Assigned ${data.summary.assigned} of ${data.summary.total} Stay Informed Now campaigns`)
    } catch (error) {
      console.error("Error assigning Stay Informed Now campaigns:", error)
      toast.error("Failed to assign Stay Informed Now campaigns")
    } finally {
      setIsStayInformedAssigning(false)
    }
  }

  const handleAssignLibertyActionNews = async () => {
    if (
      !confirm("Assign unassigned Liberty Action News campaigns based on newsletter patterns and WinRed identifiers?")
    ) {
      return
    }

    setIsLibertyActionAssigning(true)
    setLibertyActionResults(null)

    try {
      const response = await fetch("/api/admin/assign-liberty-action-news", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to assign Liberty Action News campaigns")
      }

      const data = await response.json()
      setLibertyActionResults(data)
      const totalAssigned =
        data.results.assignedToDataBroker + data.results.assignedViaWinRed + data.results.assignedViaAnedot
      toast.success(`Assigned ${totalAssigned} of ${data.results.total} Liberty Action News campaigns`)
    } catch (error) {
      console.error("Error assigning Liberty Action News campaigns:", error)
      toast.error("Failed to assign Liberty Action News campaigns")
    } finally {
      setIsLibertyActionAssigning(false)
    }
  }

  const handleAssignMagaDailyUpdates = async () => {
    if (!confirm("Assign unassigned MAGA Daily Updates campaigns based on WinRed identifiers?")) {
      return
    }

    setIsMagaDailyAssigning(true)
    setMagaDailyResults(null)

    try {
      const response = await fetch("/api/admin/assign-maga-daily-updates", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to assign MAGA Daily Updates campaigns")
      }

      const data = await response.json()
      setMagaDailyResults(data)
      toast.success(`Assigned ${data.assignedCount} of ${data.totalProcessed} MAGA Daily Updates campaigns`)
    } catch (error) {
      console.error("Error assigning MAGA Daily Updates campaigns:", error)
      toast.error("Failed to assign MAGA Daily Updates campaigns")
    } finally {
      setIsMagaDailyAssigning(false)
    }
  }

  const handleAssignOfficialTrumpTracker = async () => {
    if (!confirm("Assign unassigned Official Trump Tracker campaigns based on WinRed identifiers?")) {
      return
    }

    setIsOfficialTrumpTrackerAssigning(true)
    setOfficialTrumpTrackerResults(null)

    try {
      const response = await fetch("/api/admin/assign-official-trump-tracker", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to assign Official Trump Tracker campaigns")
      }

      const data = await response.json()
      setOfficialTrumpTrackerResults(data)
      toast.success(`Assigned ${data.assignedCount} of ${data.totalProcessed} Official Trump Tracker campaigns`)
    } catch (error) {
      console.error("Error assigning Official Trump Tracker campaigns:", error)
      toast.error("Failed to assign Official Trump Tracker campaigns")
    } finally {
      setIsOfficialTrumpTrackerAssigning(false)
    }
  }

  // --- NEW HANDLER FOR SMS FIX ---
  const handleFixSMS5417204415 = async () => {
    if (
      !confirm(
        "This will fix all SMS messages with phone number 5417204415 by extracting the real sender from the 'From:' field. Continue?",
      )
    ) {
      return
    }

    setIsFixingSMS5417204415(true)
    setSmsFixResults(null)

    try {
      const response = await fetch("/api/admin/fix-sms-5417204415", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to fix SMS messages")
      }

      const data = await response.json()
      setSmsFixResults(data)
      toast.success(`Fixed ${data.summary.updated} of ${data.summary.total} SMS messages`)
    } catch (error) {
      console.error("Error fixing SMS messages:", error)
      toast.error("Failed to fix SMS messages")
    } finally {
      setIsFixingSMS5417204415(false)
    }
  }
  // --- END NEW HANDLER ---

  const handleAutoAssignSms = async () => {
    if (
      !confirm(
        "This will process all unassigned SMS messages, unwrap URLs, and auto-assign based on donation identifiers. Continue?",
      )
    ) {
      return
    }

    setIsAutoAssigningSms(true)
    setSmsAutoAssignResults(null)

    try {
      const response = await fetch("/api/admin/auto-assign-sms", {
        method: "POST",
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to auto-assign SMS")
      }

      const data = await response.json()
      setSmsAutoAssignResults(data)
      toast.success(
        `Processed ${data.summary.totalProcessed} SMS: ${data.summary.urlsUnwrapped} URLs unwrapped, ${data.summary.smsAssigned} assigned to entities`,
      )
    } catch (error) {
      console.error("Error auto-assigning SMS:", error)
      toast.error("Failed to auto-assign SMS")
    } finally {
      setIsAutoAssigningSms(false)
    }
  }

  const handleAutoAssignCampaigns = async () => {
    if (
      !confirm(
        "This will process all unassigned campaigns (emails and SMS) and auto-assign them based on donation identifiers found in their links. Continue?",
      )
    ) {
      return
    }

    setIsAutoAssigningCampaigns(true)
    setCampaignsAutoAssignResults(null)

    try {
      const response = await fetch("/api/admin/auto-assign-campaigns", {
        method: "POST",
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to auto-assign campaigns")
      }

      const data = await response.json()
      setCampaignsAutoAssignResults(data)
      toast.success(
        `Processed campaigns: ${data.summary.emailsAssigned} emails and ${data.summary.smsAssigned} SMS assigned to entities`,
      )
    } catch (error) {
      console.error("Error auto-assigning campaigns:", error)
      toast.error("Failed to auto-assign campaigns")
    } finally {
      setIsAutoAssigningCampaigns(false)
    }
  }
  // </CHANGE>

  const handleBulkUnwrapAll = async () => {
    setIsBulkUnwrapping(true)
    try {
      const response = await fetch("/api/admin/bulk-unwrap-all", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        setBulkUnwrapResults(data)
        toast.success(
          `Batch completed: ${data.summary.totalLinksUnwrapped} links unwrapped across ${data.summary.emailCampaigns.total + data.summary.smsMessages.total} campaigns`,
        )
      } else {
        toast.error(data.error || "Failed to bulk unwrap campaigns")
      }
    } catch (error) {
      toast.error("Failed to bulk unwrap campaigns")
    } finally {
      setIsBulkUnwrapping(false)
    }
  }

  const handleAnalyzePlatforms = async () => {
    setIsAnalyzingPlatforms(true)
    setPlatformAnalysisResults(null)

    try {
      const response = await fetch("/api/admin/analyze-platforms", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        setPlatformAnalysisResults(data)
        toast.success(
          `Platform analysis completed: Found ${data.summary.totalUniqueDomains} unique domains across ${data.summary.totalLinkCount} total links`,
        )
      } else {
        toast.error(data.error || "Failed to analyze platforms")
      }
    } catch (error) {
      toast.error("Failed to analyze platforms")
    } finally {
      setIsAnalyzingPlatforms(false)
    }
  }

  const downloadPlatformAnalysis = () => {
    if (!platformAnalysisResults) return

    const csv = [["Domain", "Count"], ...platformAnalysisResults.domains.map((d) => [d.domain, d.count])]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `platform-usage-${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  // </CHANGE>

  const handleTestUnwrapUrl = async () => {
    console.log("[v0] Test unwrap button clicked")
    console.log("[v0] Test URL:", testUrl)
    // </CHANGE>

    if (!testUrl.trim()) {
      console.log("[v0] No URL entered - showing error")
      // </CHANGE>
      toast.error("Please enter a URL to test")
      return
    }

    setIsTestingUrl(true)
    setTestUrlResults(null)

    console.log("[v0] Making API request to /api/admin/test-unwrap-url")
    // </CHANGE>

    try {
      const response = await fetch("/api/admin/test-unwrap-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: testUrl.trim() }),
      })

      console.log("[v0] API response status:", response.status)
      // </CHANGE>

      const data = await response.json()

      console.log("[v0] API response data:", data)
      // </CHANGE>

      if (response.ok) {
        console.log("[v0] Setting test results:", {
          steps: data.redirectChain?.totalSteps,
          changed: data.final?.changed,
        })
        // </CHANGE>
        setTestUrlResults(data)
        if (data.final.changed) {
          toast.success(`URL unwrapped successfully (${data.redirectChain.totalSteps} steps)`)
        } else {
          toast.info("URL already at final destination")
        }
      } else {
        console.log("[v0] API error:", data.error)
        // </CHANGE>
        toast.error(data.error || "Failed to unwrap URL")
      }
    } catch (error) {
      console.error("[v0] Fetch error:", error)
      // </CHANGE>
      toast.error("Failed to unwrap URL")
    } finally {
      console.log("[v0] Test unwrap complete - resetting loading state")
      // </CHANGE>
      setIsTestingUrl(false)
    }
  }
  // </CHANGE>

  const handleBatchUnwrap = async () => {
    setIsBatchUnwrapping(true)
    try {
      const response = await fetch("/api/admin/batch-unwrap-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lastEmailId: batchUnwrapCursor.lastEmailId,
          lastSmsId: batchUnwrapCursor.lastSmsId,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setBatchUnwrapResults({
          emails: data.results.emails,
          sms: data.results.sms,
          totals: data.results.totals,
          hasMore: data.hasMore,
          message: data.message,
        })
        setBatchUnwrapCursor({
          lastEmailId: data.results.emails.lastId,
          lastSmsId: data.results.sms.lastId,
        })
        setTotalBatchesRun((prev) => prev + 1)
        toast.success(data.message)
      } else {
        toast.error(data.error || "Failed to process batch")
      }
    } catch (error) {
      toast.error("Failed to process batch")
    } finally {
      setIsBatchUnwrapping(false)
    }
  }

  const handleResetBatchCursor = () => {
    setBatchUnwrapCursor({ lastEmailId: null, lastSmsId: null })
    setBatchUnwrapResults(null)
    setTotalBatchesRun(0)
    toast.info("Cursor reset - will start from beginning")
  }

  const handleAnalyzePSQ = async () => {
    setIsAnalyzingPSQ(true)
    setPsqPatterns(null)
    try {
      const response = await fetch("/api/admin/analyze-psq-patterns", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        setPsqPatterns(data)
        toast.success(
          `PSQ Impact analysis completed: Found ${data.summary.totalPatterns} unique patterns with ${data.summary.totalOccurrences} total occurrences`,
        )
      } else {
        toast.error(data.error || "Failed to analyze PSQ Impact patterns")
      }
    } catch (error) {
      toast.error("Failed to analyze PSQ Impact patterns")
    } finally {
      setIsAnalyzingPSQ(false)
    }
  }

  const downloadPSQPatterns = () => {
    if (!psqPatterns) return

    const csv = [
      ["Pattern", "Identifier", "Count", "Example URL"],
      ...psqPatterns.patterns.map((p: any) => [p.pattern, p.identifier, p.count, p.fullUrl]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `psq-patterns-${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleUnwrapSingleCampaign = async () => {
    if (!unwrapCampaignId.trim()) {
      toast.error("Please enter a campaign ID or share link")
      return
    }

    setIsUnwrappingSingle(true)
    setUnwrapResults(null)
    try {
      const response = await fetch("/api/admin/unwrap-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ campaignId: unwrapCampaignId.trim() }),
      })

      const data = await response.json()

      if (response.ok) {
        const displayName =
          data.campaign.type === "email"
            ? data.campaign.subject
            : `SMS from ${data.campaign.phoneNumber}: ${data.campaign.messagePreview}...`

        toast.success(`Unwrapped ${data.linksUpdated} out of ${data.totalLinks} links`)
        setUnwrapResults({
          type: data.campaign.type,
          displayName,
          details: data.unwrapDetails,
        })
        setUnwrapCampaignId("")
      } else {
        toast.error(data.error || "Failed to unwrap campaign")
      }
    } catch (error) {
      toast.error("Failed to unwrap campaign")
    } finally {
      setIsUnwrappingSingle(false)
    }
  }

  return (
  <div className="container mx-auto p-6 space-y-6">
  {" "}
  {/* Changed from "space-y-6" to "container mx-auto p-6 space-y-6" */}
  <div>
  <h2 className="text-2xl font-bold">Admin Tools</h2>
  <p className="text-muted-foreground">Administrative tools and utilities</p>
  </div>

  {/* Message Stats Chart */}
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle>Messages Received</CardTitle>
          <CardDescription>Daily email and SMS volume with 7-day moving average</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={!startDate && !endDate && dateRange.days === 7 ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setStartDate("")
              setEndDate("")
              setDateRange({ days: 7 })
            }}
          >
            7d
          </Button>
          <Button
            variant={!startDate && !endDate && dateRange.days === 30 ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setStartDate("")
              setEndDate("")
              setDateRange({ days: 30 })
            }}
          >
            30d
          </Button>
          <Button
            variant={!startDate && !endDate && dateRange.days === 90 ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setStartDate("")
              setEndDate("")
              setDateRange({ days: 90 })
            }}
          >
            90d
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="start-date" className="text-sm">Start Date</Label>
          <Input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="end-date" className="text-sm">End Date</Label>
          <Input
            id="end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-auto"
          />
        </div>
        {(startDate || endDate) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setStartDate("")
              setEndDate("")
            }}
          >
            Clear
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent>
      {loadingStats ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : dailyStats.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          No data available for the selected date range
        </div>
      ) : (
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyStats} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => {
                  const date = new Date(value)
                  return `${date.getMonth() + 1}/${date.getDate()}`
                }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                labelFormatter={(value) => {
                  const date = new Date(value as string)
                  return date.toLocaleDateString()
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="emails" 
                stroke="#3b82f6" 
                strokeWidth={2}
                name="Emails"
                dot={{ fill: '#3b82f6', r: 3 }}
              />
              <Line 
                type="monotone" 
                dataKey="sms" 
                stroke="#10b981" 
                strokeWidth={2}
                name="SMS"
                dot={{ fill: '#10b981', r: 3 }}
              />
              <Line 
                type="monotone" 
                dataKey="emailsAvg" 
                stroke="#93c5fd" 
                strokeWidth={2}
                strokeDasharray="5 5"
                name="Emails (7d avg)"
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="smsAvg" 
                stroke="#6ee7b7" 
                strokeWidth={2}
                strokeDasharray="5 5"
                name="SMS (7d avg)"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </CardContent>
  </Card>

  <Card>
        <CardHeader>
          <CardTitle>Campaign Detection</CardTitle>
          <CardDescription>Scan seed email accounts to automatically detect new campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignDetectionDialog onDetectionComplete={() => toast.success("Campaign detection completed")} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Competitive Insights Detection</CardTitle>
          <CardDescription>
            Scan RIP-locked seed emails to detect competitor campaigns and build competitive intelligence
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompetitiveInsightsDetectionDialog
            onDetectionComplete={() => toast.success("Competitive insights detection completed")}
          />
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>Engagement Simulator</CardTitle>
          <CardDescription>
            Manually trigger the engagement simulation to generate realistic email interactions for seed accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleRunEngagement} disabled={isRunning} className="gap-2">
            {isRunning ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play size={16} />
                Run Engagement Simulation
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>SMS Gateway Migration</CardTitle>
          <CardDescription>
            Migrate existing SMS campaigns to extract short codes from gateway messages (763257xxxx format)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleMigrateSMS} disabled={isMigratingSMS} className="gap-2">
            {isMigratingSMS ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Migrating...
              </>
            ) : (
              <>
                <Play size={16} />
                Run SMS Migration
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Email Sanitization</CardTitle>
          <CardDescription>
            Remove all email addresses from stored campaign emails to protect seed email addresses from exposure. This
            will process all emails in batches and may take several minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleSanitizeEmails} disabled={isSanitizingEmails} className="gap-2">
            {isSanitizingEmails ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Sanitizing...
              </>
            ) : (
              <>
                <Play size={16} />
                Sanitize All Emails
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>SMS CTA Links Backfill</CardTitle>
          <CardDescription>
            Extract and store CTA links from existing SMS messages in the SmsQueue table. This will process all SMS
            messages that don't have links extracted yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleBackfillSMSLinks} disabled={isBackfillingSMSLinks} className="gap-2">
            {isBackfillingSMSLinks ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Backfilling...
              </>
            ) : (
              <>
                <Play size={16} />
                Backfill SMS Links
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Clean CTA Parameters</CardTitle>
          <CardDescription>
            Remove query parameters (including email addresses and phone numbers) from all CTA links in existing email
            campaigns and SMS messages. This protects privacy by stripping tracking parameters while preserving the
            destination URLs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleCleanCTAParams} disabled={isCleaningCTAParams} className="gap-2">
            {isCleaningCTAParams ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Cleaning...
              </>
            ) : (
              <>
                <Play size={16} />
                Clean CTA Parameters
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sanitize Subject Lines</CardTitle>
          <CardDescription>
            Remove seed email addresses from campaign subject lines to protect privacy. This will scan all existing
            campaign subjects and replace any seed email addresses with [Email]. Sender email addresses will be
            preserved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleSanitizeSubjects} disabled={isSanitizingSubjects} className="gap-2">
            {isSanitizingSubjects ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Sanitizing...
              </>
            ) : (
              <>
                <Play size={16} />
                Sanitize Subject Lines
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Unwrap CTA Links</CardTitle>
          <CardDescription>
            Follow tracking redirects to resolve final destination URLs for all CTA links. This will process campaigns
            that have wrapped tracking URLs (e.g., click.messages.example.com) and resolve them to their actual
            destinations. Uses a 30-second timeout per link. May take several minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleUnwrapCTALinks} disabled={isUnwrappingLinks} className="gap-2">
            {isUnwrappingLinks ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Unwrapping...
              </>
            ) : (
              <>
                <Play size={16} />
                Unwrap CTA Links
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sanitize Email Links</CardTitle>
          <CardDescription>
            Remove query parameters from all links within stored email HTML content. This protects seed email addresses
            by stripping tracking parameters from URLs embedded in the email body while preserving the base URLs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleSanitizeEmailLinks} disabled={isSanitizingEmailLinks} className="gap-2">
            {isSanitizingEmailLinks ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Sanitizing...
              </>
            ) : (
              <>
                <Play size={16} />
                Sanitize Email Links
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Redact Compliance Links</CardTitle>
          <CardDescription>
            Replace unsubscribe, opt-out, opt-in, privacy policy, and subscription links in stored email HTML with
            [Omitted]. Enter a specific campaign ID to test on a single campaign, or leave blank to run on all campaigns.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Campaign ID (optional — leave blank for all)"
              value={redactCampaignId}
              onChange={(e) => setRedactCampaignId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <Button onClick={handleRedactEmailLinks} disabled={isRedactingEmailLinks} className="gap-2 w-fit">
            {isRedactingEmailLinks ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Redacting...
              </>
            ) : (
              <>
                <Play size={16} />
                {redactCampaignId.trim() ? "Redact Campaign" : "Redact All Campaigns"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Auto-Populate WinRed Identifiers</CardTitle>
          <CardDescription>
            Automatically extract and populate WinRed donation identifiers from existing campaigns for all Republican
            entities. This will scan campaigns and SMS messages, find WinRed URLs, and store the identifiers for future
            auto-assignment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleAutoPopulateWinRed} disabled={isAutoPopulatingWinRed} className="gap-2">
            {isAutoPopulatingWinRed ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Auto-Populating...
              </>
            ) : (
              <>
                <Play size={16} />
                Auto-Populate WinRed Identifiers
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Auto-Populate Anedot Identifiers</CardTitle>
          <CardDescription>
            Automatically extract and populate Anedot donation identifiers from existing campaigns for ALL entities
            (Republican, Democrat, Independent). This will scan campaigns and SMS messages, find Anedot URLs, and store
            the identifiers for future auto-assignment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleAutoPopulateAnedot} disabled={isAutoPopulatingAnedot} className="gap-2">
            {isAutoPopulatingAnedot ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Auto-Populating...
              </>
            ) : (
              <>
                <Play size={16} />
                Auto-Populate Anedot Identifiers
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Analyze ActBlue URL Patterns</CardTitle>
          <CardDescription>
            Scan all campaigns and SMS messages to identify ActBlue URL patterns. This helps understand the different
            URL structures used by ActBlue (donate/, contribute/page/, etc.) and their identifiers. Results are sorted
            alphabetically and can be exported as CSV.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleAnalyzeActBlue} disabled={isAnalyzingActBlue} className="gap-2">
            {isAnalyzingActBlue ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Play size={16} />
                Analyze ActBlue Patterns
              </>
            )}
          </Button>

          {actBluePatterns && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <h4 className="font-semibold">Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Unique Patterns:</span>
                    <span className="ml-2 font-medium">{actBluePatterns.summary.totalPatterns}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Occurrences:</span>
                    <span className="ml-2 font-medium">{actBluePatterns.summary.totalOccurrences}</span>
                  </div>
                </div>
                <div className="pt-2">
                  <p className="text-sm text-muted-foreground mb-2">Pattern Types:</p>
                  <div className="space-y-1">
                    {Object.entries(actBluePatterns.summary.patternTypes).map(([pattern, count]) => (
                      <div key={pattern} className="text-sm">
                        <span className="font-mono">{pattern}</span>:{" "}
                        <span className="font-medium">{count as number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Button onClick={downloadActBluePatterns} variant="outline" className="gap-2 bg-transparent">
                Download CSV Export
              </Button>

              <div className="rounded-lg border max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      <th className="text-left p-2 font-medium">Pattern</th>
                      <th className="text-left p-2 font-medium">Identifier</th>
                      <th className="text-right p-2 font-medium">Count</th>
                      <th className="text-left p-2 font-medium">Example URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actBluePatterns.patterns.map((pattern: any, index: number) => (
                      <tr key={index} className="border-b last:border-b-0">
                        <td className="p-2 font-mono text-xs">{pattern.pattern}</td>
                        <td className="p-2 font-mono text-xs">{pattern.identifier}</td>
                        <td className="p-2 text-right">{pattern.count}</td>
                        <td className="p-2 text-xs text-muted-foreground truncate max-w-md" title={pattern.fullUrl}>
                          {pattern.fullUrl}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Auto-Assign All Unassigned Campaigns</CardTitle>
          <CardDescription>
            Automatically process all unassigned campaigns (both emails and SMS) and assign them to entities based on
            WinRed, ActBlue, Anedot, or PSQ donation identifiers found in their CTA links.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleAutoAssignCampaigns} disabled={isAutoAssigningCampaigns} className="gap-2">
            {isAutoAssigningCampaigns ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processing Campaigns...
              </>
            ) : (
              <>
                <Play size={16} />
                Process & Auto-Assign All Campaigns
              </>
            )}
          </Button>

          {campaignsAutoAssignResults && (
            <div className="mt-4 space-y-4">
              {/* Summary */}
              <div className="rounded-lg border bg-muted/50 p-4">
                <h4 className="mb-2 font-semibold">Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Total Emails Processed</div>
                    <div className="text-2xl font-bold">{campaignsAutoAssignResults.summary.totalEmails}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Emails Assigned</div>
                    <div className="text-2xl font-bold text-green-600">
                      {campaignsAutoAssignResults.summary.emailsAssigned}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total SMS Processed</div>
                    <div className="text-2xl font-bold">{campaignsAutoAssignResults.summary.totalSms}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">SMS Assigned</div>
                    <div className="text-2xl font-bold text-green-600">
                      {campaignsAutoAssignResults.summary.smsAssigned}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sample Assignments */}
              {campaignsAutoAssignResults.samples.emails.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Sample Email Assignments</div>
                  <div className="space-y-2">
                    {campaignsAutoAssignResults.samples.emails.map((result, idx) => (
                      <div key={idx} className="rounded border border-green-200 bg-green-50 p-3 text-xs dark:border-green-800 dark:bg-green-950/20">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-mono text-muted-foreground">{result.subject}</span>
                          <span className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white">
                            Assigned
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div>
                            <span className="font-semibold text-green-600">Entity:</span>
                            <span className="ml-2 font-medium text-green-600">{result.entityName}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-muted-foreground">Identifier:</span>
                            <span className="ml-2 font-mono">{result.identifier}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {campaignsAutoAssignResults.samples.sms.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Sample SMS Assignments</div>
                  <div className="space-y-2">
                    {campaignsAutoAssignResults.samples.sms.map((result, idx) => (
                      <div key={idx} className="rounded border border-green-200 bg-green-50 p-3 text-xs dark:border-green-800 dark:bg-green-950/20">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-mono text-muted-foreground">{result.phoneNumber}</span>
                          <span className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white">
                            Assigned
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div>
                            <span className="font-semibold text-green-600">Entity:</span>
                            <span className="ml-2 font-medium text-green-600">{result.entityName}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-muted-foreground">Identifier:</span>
                            <span className="ml-2 font-mono">{result.identifier}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Platform Usage Analysis</CardTitle>
          <CardDescription>
            Scan all CI email campaigns and SMS messages to identify donation platforms being used. This analyzes CTA
            links to detect WinRed, ActBlue, Anedot, PSQ Impact, and other platforms. Use this to see which platforms
            are actually appearing in your data before adding them to filters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleAnalyzePlatforms} disabled={isAnalyzingPlatforms} className="gap-2">
            {isAnalyzingPlatforms ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Play size={16} />
                Analyze Platform Usage
              </>
            )}
          </Button>

          {platformAnalysisResults && (
            <div className="space-y-4">
              {/* Summary Section from Updates */}
              <div className="rounded-lg border p-4">
                <h3 className="text-lg font-semibold mb-4">Summary</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Email Campaigns:</p>
                    <p className="text-2xl font-bold">{platformAnalysisResults.summary.totalEmailCampaigns}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total SMS Messages:</p>
                    <p className="text-2xl font-bold">{platformAnalysisResults.summary.totalSmsMessages}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Unique Domains:</p>
                    <p className="text-2xl font-bold">{platformAnalysisResults.summary.totalUniqueDomains}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Links:</p>
                    <p className="text-2xl font-bold">{platformAnalysisResults.summary.totalLinkCount}</p>
                  </div>
                </div>
              </div>

              {/* Download Button from Updates */}
              <Button onClick={downloadPlatformAnalysis} variant="outline">
                Download CSV Export
              </Button>

              {/* All Domains Table from Updates */}
              <div className="rounded-lg border">
                <div className="p-4 border-b">
                  <h3 className="text-lg font-semibold">All Domains</h3>
                  <p className="text-sm text-muted-foreground">
                    Showing all {platformAnalysisResults.domains.length} domains found in CTA links
                  </p>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-3 font-semibold">Domain</th>
                        <th className="text-right p-3 font-semibold">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {platformAnalysisResults.domains.map((domain, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-3 font-mono text-sm">{domain.domain}</td>
                          <td className="p-3 text-right font-semibold">{domain.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* </CHANGE> */}
      <Card>
        <CardHeader>
          <CardTitle>Unwrap Single Campaign or SMS</CardTitle>
          <CardDescription>
            Enter a CI campaign ID, SMS ID, or share link to unwrap its CTA links individually. This works for both
            email campaigns and SMS messages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter campaign/SMS ID or share link (e.g., https://app.rip-tool.com/share/abc123)"
              value={unwrapCampaignId}
              onChange={(e) => setUnwrapCampaignId(e.target.value)}
              disabled={isUnwrappingSingle}
            />
            <Button
              onClick={handleUnwrapSingleCampaign}
              disabled={isUnwrappingSingle || !unwrapCampaignId.trim()}
              className="gap-2 whitespace-nowrap"
            >
              {isUnwrappingSingle ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Unwrapping...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Unwrap
                </>
              )}
            </Button>
          </div>

          {unwrapResults && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded ${
                      unwrapResults.type === "email"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    }`}
                  >
                    {unwrapResults.type === "email" ? "Email" : "SMS"}
                  </span>
                  <h4 className="font-medium text-sm">{unwrapResults.displayName}</h4>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setUnwrapResults(null)}>
                  Clear
                </Button>
              </div>
              <div className="border rounded-lg max-h-96 overflow-y-auto">
                <div className="divide-y">
                  {unwrapResults.details.map((detail, index) => (
                    <div
                      key={index}
                      className={`p-3 ${detail.changed ? "bg-green-50 dark:bg-green-950/20" : "bg-muted/30"}`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-medium text-muted-foreground shrink-0 mt-0.5">Original:</span>
                          <span className="text-xs break-all">{detail.original}</span>
                        </div>
                        {detail.changed && (
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-medium text-green-600 dark:text-green-400 shrink-0 mt-0.5">
                              Final:
                            </span>
                            <span className="text-xs break-all text-green-600 dark:text-green-400">{detail.final}</span>
                          </div>
                        )}
                        {!detail.changed && (
                          <span className="text-xs text-muted-foreground italic">No redirect found</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Test URL Unwrapping</CardTitle>
          <CardDescription>
            Test URL unwrapping to see step-by-step redirect resolution and query parameter stripping. This helps debug
            SMS link unwrapping issues.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="https://example.com/link"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleTestUnwrapUrl()
                }
              }}
              className="flex-1"
            />
            <Button onClick={handleTestUnwrapUrl} disabled={isTestingUrl} className="gap-2">
              {isTestingUrl ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Test Unwrap
                </>
              )}
            </Button>
          </div>

          {testUrlResults && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-lg border p-4 space-y-2">
                <h4 className="font-semibold">Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Redirects:</span>
                    <span className="ml-2 font-medium">{testUrlResults.summary.redirects}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Time:</span>
                    <span className="ml-2 font-medium">{testUrlResults.summary.totalTime}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">URL Changed:</span>
                    <span className="ml-2 font-medium">
                      {testUrlResults.summary.changed ? (
                        <span className="text-green-600">Yes</span>
                      ) : (
                        <span className="text-gray-600">No</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Original URL */}
              <div className="rounded-lg border p-4 space-y-2">
                <h4 className="font-semibold text-sm">Original URL</h4>
                <div className="space-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Full URL:</span>
                    <div className="font-mono bg-muted p-2 rounded mt-1 break-all">{testUrlResults.original.url}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Stripped (no query params):</span>
                    <div className="font-mono bg-muted p-2 rounded mt-1 break-all">
                      {testUrlResults.original.stripped}
                    </div>
                  </div>
                  {testUrlResults.original.hasQueryParams && (
                    <div className="text-orange-600 text-xs">⚠️ Query parameters detected and will be removed</div>
                  )}
                </div>
              </div>

              {/* Redirect Chain */}
              <div className="rounded-lg border p-4 space-y-2">
                <h4 className="font-semibold text-sm">
                  Redirect Chain ({testUrlResults.redirectChain.totalSteps} steps)
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {testUrlResults.redirectChain.steps.map((step, index) => (
                    <div key={index} className="border-l-2 border-blue-500 pl-3 py-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold">Step {step.step}</span>
                        <span className="text-muted-foreground">•</span>
                        <span
                          className={`font-medium ${step.status === 200 ? "text-green-600" : step.status >= 300 && step.status < 400 ? "text-blue-600" : "text-red-600"}`}
                        >
                          {step.status || "Error"}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">{step.timing}ms</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{step.redirectType}</div>
                      <div className="font-mono text-xs bg-muted p-1 rounded mt-1 break-all">{step.url}</div>
                      {(step as any).htmlSnippet && (
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            View HTML Response (first 500 chars)
                          </summary>
                          <div className="mt-1 font-mono text-xs bg-yellow-50 dark:bg-yellow-950/20 p-2 rounded border border-yellow-200 dark:border-yellow-800 overflow-x-auto whitespace-pre-wrap">
                            {(step as any).htmlSnippet}
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
                {testUrlResults.redirectChain.error && (
                  <div className="text-red-600 text-xs bg-red-50 p-2 rounded">
                    ⚠️ Error: {testUrlResults.redirectChain.error}
                  </div>
                )}
              </div>

              {/* Final URL */}
              <div className="rounded-lg border p-4 space-y-2">
                <h4 className="font-semibold text-sm">Final URL</h4>
                <div className="space-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Full URL:</span>
                    <div className="font-mono bg-muted p-2 rounded mt-1 break-all">{testUrlResults.final.url}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Stripped (stored in database):</span>
                    <div className="font-mono bg-green-50 p-2 rounded mt-1 break-all font-semibold">
                      {testUrlResults.final.stripped}
                    </div>
                  </div>
                  {testUrlResults.final.hasQueryParams && (
                    <div className="text-orange-600 text-xs">⚠️ Query parameters were removed from final URL</div>
                  )}
                  {testUrlResults.final.changed ? (
                    <div className="text-green-600 text-xs font-medium">
                      ✓ URL was successfully unwrapped from original
                    </div>
                  ) : (
                    <div className="text-gray-600 text-xs">URL was already at final destination</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batch Unwrap Links Tool */}
      {console.log("[v0] Rendering Batch Unwrap Links card")}
      <Card>
        <CardHeader>
          <CardTitle>Batch Unwrap Links</CardTitle>
          <CardDescription>
            Process 10 emails and 10 SMS at a time, unwrapping any links that are missing finalUrl or where finalUrl
            equals the original URL. Click multiple times to process all records. Uses cursor-based pagination to avoid
            reprocessing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleBatchUnwrap} disabled={isBatchUnwrapping} className="gap-2">
              {isBatchUnwrapping ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play size={16} />
                  {batchUnwrapResults?.hasMore ? "Process Next Batch" : "Start Batch Unwrap"}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleResetBatchCursor}
              disabled={isBatchUnwrapping}
              className="gap-2 bg-transparent"
            >
              <X size={16} />
              Reset Cursor
            </Button>
          </div>

          {/* Progress Info */}
          {(batchUnwrapCursor.lastEmailId || batchUnwrapCursor.lastSmsId) && (
            <div className="text-xs text-muted-foreground">
              <span>Cursor Position - </span>
              <span>Last Email ID: {batchUnwrapCursor.lastEmailId || "Start"}</span>
              <span className="mx-2">|</span>
              <span>Last SMS ID: {batchUnwrapCursor.lastSmsId || "Start"}</span>
              <span className="mx-2">|</span>
              <span>Batches Run: {totalBatchesRun}</span>
            </div>
          )}

          {batchUnwrapResults && (
            <div className="space-y-4">
              {/* Status Banner */}
              {batchUnwrapResults.hasMore ? (
                <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-3 text-sm">
                  <span className="font-semibold text-yellow-800">More records available.</span>
                  <span className="text-yellow-700 ml-1">
                    Total: {batchUnwrapResults.totals.emails} emails, {batchUnwrapResults.totals.sms} SMS in database.
                  </span>
                </div>
              ) : (
                <div className="rounded-lg border border-green-500 bg-green-50 p-3 text-sm">
                  <span className="font-semibold text-green-800">Batch complete!</span>
                  <span className="text-green-700 ml-1">{batchUnwrapResults.message}</span>
                </div>
              )}

              {/* Results Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-3 space-y-2">
                  <h4 className="font-semibold text-sm">Emails This Batch</h4>
                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-muted-foreground">Processed:</span>
                      <span className="ml-2 font-medium">{batchUnwrapResults.emails.processed}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Links Unwrapped:</span>
                      <span className="ml-2 font-medium text-green-600">
                        {batchUnwrapResults.emails.linksUnwrapped}
                      </span>
                    </div>
                    {batchUnwrapResults.emails.errors.length > 0 && (
                      <div>
                        <span className="text-muted-foreground">Errors:</span>
                        <span className="ml-2 font-medium text-red-600">
                          {batchUnwrapResults.emails.errors.length}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-2">
                  <h4 className="font-semibold text-sm">SMS This Batch</h4>
                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-muted-foreground">Processed:</span>
                      <span className="ml-2 font-medium">{batchUnwrapResults.sms.processed}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Links Unwrapped:</span>
                      <span className="ml-2 font-medium text-green-600">{batchUnwrapResults.sms.linksUnwrapped}</span>
                    </div>
                    {batchUnwrapResults.sms.errors.length > 0 && (
                      <div>
                        <span className="text-muted-foreground">Errors:</span>
                        <span className="ml-2 font-medium text-red-600">{batchUnwrapResults.sms.errors.length}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Error Details */}
              {(batchUnwrapResults.emails.errors.length > 0 || batchUnwrapResults.sms.errors.length > 0) && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                  <h4 className="font-semibold text-sm text-red-800">Errors</h4>
                  <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
                    {batchUnwrapResults.emails.errors.map((err, i) => (
                      <div key={`email-${i}`} className="text-red-700">
                        <span className="font-medium">Email {err.id}:</span> {err.subject} - {err.error}
                      </div>
                    ))}
                    {batchUnwrapResults.sms.errors.map((err, i) => (
                      <div key={`sms-${i}`} className="text-red-700">
                        <span className="font-medium">SMS {err.id}:</span> {err.phone} - {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
