"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Play, X, Mail, MessageSquare, TrendingUp, CalendarIcon, Twitter } from "lucide-react"
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
  const [isTriggeringDigest, setIsTriggeringDigest] = useState(false)
  const [digestEmailOverride, setDigestEmailOverride] = useState("")
  const [digestDateOffset, setDigestDateOffset] = useState("1")
  const [digestTriggerResult, setDigestTriggerResult] = useState<{
    sent: number
    failed: number
    window: { label: string }
    results: Array<{ email: string; sent: boolean; entityCount: number; messageCount: number }>
  } | null>(null)
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [dateRange, setDateRange] = useState({ days: 30 })
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [isMigratingSMS, setIsMigratingSMS] = useState(false)
  const [isMigratingSMSNumbers, setIsMigratingSMSNumbers] = useState(false)
  const [isSanitizingEmails, setIsSanitizingEmails] = useState(false)
  const [isBackfillingSMSLinks, setIsBackfillingSMSLinks] = useState(false)
  const [isReassigningSubstack, setIsReassigningSubstack] = useState(false)
  const [reassignSubstackResults, setReassignSubstackResults] = useState<{
    unassigned: number
    reassigned: number
    unmatched: number
    samples: Array<{ campaignId: string; subject: string; entity: string }>
  } | null>(null)
  const [isRedactingSMSLinks, setIsRedactingSMSLinks] = useState(false)
  const [redactSMSLinksResults, setRedactSMSLinksResults] = useState<{
    dryRun: boolean
    total: number
    updated: number
    skipped: number
    samples: Array<{ id: string; before: string; after: string }>
  } | null>(null)
  const [isCleaningCTAParams, setIsCleaningCTAParams] = useState(false)
  const [isSanitizingSubjects, setIsSanitizingSubjects] = useState(false)
  const [isUnwrappingLinks, setIsUnwrappingLinks] = useState(false)
  const [isSanitizingEmailLinks, setIsSanitizingEmailLinks] = useState(false)
  const [isRedactingEmailLinks, setIsRedactingEmailLinks] = useState(false)
  const [redactCampaignId, setRedactCampaignId] = useState("")
  const [isPostingTweet, setIsPostingTweet] = useState(false)
  const [tweetResult, setTweetResult] = useState<{
    tweetUrl: string | null
    tweetText: string
    entity: string
    type: string
    score: number
    shareUrl: string
    candidatesEvaluated: number
  } | null>(null)

  const [isDkimAuditing, setIsDkimAuditing] = useState(false)
  const [dkimAuditResults, setDkimAuditResults] = useState<{
    results: Array<{ selector: string; count: number; percentage: number; mappedTo: string | null }>
    totalEmails: number
    uniqueSelectors: number
    unmappedCount: number
  } | null>(null)
  const [addingSelector, setAddingSelector] = useState<string | null>(null)
  const [dkimNewName, setDkimNewName] = useState<Record<string, string>>({})

  const [isAutoPopulatingWinRed, setIsAutoPopulatingWinRed] = useState(false)
  const [isAutoPopulatingAnedot, setIsAutoPopulatingAnedot] = useState(false)
  const [isAutoPopulatingActBlue, setIsAutoPopulatingActBlue] = useState(false)
  const [isAutoPopulatingPSQ, setIsAutoPopulatingPSQ] = useState(false)
  const [isAutoPopulatingEngage, setIsAutoPopulatingEngage] = useState(false)
  const [isAnalyzingActBlue, setIsAnalyzingActBlue] = useState(false)
  const [actBluePatterns, setActBluePatterns] = useState<any>(null)
  const [urlKeyword, setUrlKeyword] = useState("")
  const [isScanningUrlKeyword, setIsScanningUrlKeyword] = useState(false)
  const [urlKeywordResults, setUrlKeywordResults] = useState<any>(null)
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
  const [isRemovingFinalURL, setIsRemovingFinalURL] = useState(false)
  const [removeFinalURLResults, setRemoveFinalURLResults] = useState<{
    emailCampaignsUpdated: number
    emailCampaignsSkipped: number
    emailLinksRemoved: number
    smsMessagesUpdated: number
    smsMessagesSkipped: number
    smsLinksRemoved: number
    totalLinksRemoved: number
  } | null>(null)
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

  // Donation platform backfill state
  const [isBackfillingPlatform, setIsBackfillingPlatform] = useState(false)
  const [platformBackfillResults, setPlatformBackfillResults] = useState<{
    dryRun: boolean
    summary: {
      processed: number
      updated: number
      alreadySet: number
      noMatch: number
      byPlatform: Record<string, number>
    }
    samples: Array<{ id: string; subject: string; platform: string }>
  } | null>(null)

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

  const handleTriggerDigest = async () => {
    setIsTriggeringDigest(true)
    setDigestTriggerResult(null)
    try {
      const body: Record<string, unknown> = {
        dateOffset: parseInt(digestDateOffset, 10) || 1,
      }
      if (digestEmailOverride.trim()) {
        body.email = digestEmailOverride.trim()
      }
      const response = await fetch("/api/admin/trigger-digest", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (response.ok) {
        setDigestTriggerResult(data)
        toast.success(`Digest sent to ${data.sent} user${data.sent === 1 ? "" : "s"} for ${data.window?.label}`)
      } else {
        toast.error(data.error || "Failed to trigger digest")
      }
    } catch {
      toast.error("Failed to trigger digest")
    } finally {
      setIsTriggeringDigest(false)
    }
  }

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

  const handleMigrateSMSNumbers = async () => {
    setIsMigratingSMSNumbers(true)
    try {
      const response = await fetch("/api/admin/migrate-sms-numbers", {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(
          `SMS numbers migration completed: ${data.updated} updated, ${data.skipped} skipped, ${data.errors} errors`,
        )
      } else {
        toast.error(data.error || "Failed to run SMS numbers migration")
      }
    } catch (error) {
      toast.error("Failed to run SMS numbers migration")
    } finally {
      setIsMigratingSMSNumbers(false)
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

  const handleRedactSMSLinks = async (dryRun = false) => {
    setIsRedactingSMSLinks(true)
    setRedactSMSLinksResults(null)
    try {
      const response = await fetch("/api/admin/redact-sms-links", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      })
      const data = await response.json()
      if (response.ok) {
        setRedactSMSLinksResults(data)
        toast.success(
          dryRun
            ? `Dry run: ${data.updated} messages would be updated`
            : `Done: ${data.updated} messages updated, ${data.skipped} already clean`
        )
      } else {
        toast.error(data.error || "Failed to redact SMS links")
      }
    } catch (error) {
      toast.error("Failed to redact SMS links")
    } finally {
      setIsRedactingSMSLinks(false)
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

const handleAutoPopulateActBlue = async () => {
  setIsAutoPopulatingActBlue(true)
  try {
    const response = await fetch("/api/admin/auto-populate-actblue", {
      method: "POST",
      credentials: "include",
    })
    const data = await response.json()
    if (response.ok) {
      toast.success(
        `ActBlue identifier auto-population completed: ${data.summary.updated} updated, ${data.summary.skipped} skipped, ${data.summary.errors} errors`,
      )
    } else {
      toast.error(data.error || "Failed to auto-populate ActBlue identifiers")
    }
  } catch {
    toast.error("Failed to auto-populate ActBlue identifiers")
  } finally {
    setIsAutoPopulatingActBlue(false)
  }
}

const handleAutoPopulatePSQ = async () => {
  setIsAutoPopulatingPSQ(true)
  try {
    const response = await fetch("/api/admin/auto-populate-psq", {
      method: "POST",
      credentials: "include",
    })
    const data = await response.json()
    if (response.ok) {
      toast.success(
        `PSQ identifier auto-population completed: ${data.summary.updated} updated, ${data.summary.skipped} skipped, ${data.summary.errors} errors`,
      )
    } else {
      toast.error(data.error || "Failed to auto-populate PSQ identifiers")
    }
  } catch {
    toast.error("Failed to auto-populate PSQ identifiers")
  } finally {
    setIsAutoPopulatingPSQ(false)
  }
}

const handleAutoPopulateEngage = async () => {
  setIsAutoPopulatingEngage(true)
  try {
    const response = await fetch("/api/admin/auto-populate-engage", {
      method: "POST",
      credentials: "include",
    })

    const data = await response.json()

    if (response.ok) {
      toast.success(`Engage auto-population completed: Updated ${data.updated} entities with ${data.totalIdentifiers} identifiers found`)
    } else {
      toast.error(data.error || "Failed to auto-populate Engage identifiers")
    }
  } catch {
    toast.error("Failed to auto-populate Engage identifiers")
  } finally {
    setIsAutoPopulatingEngage(false)
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

const handleScanUrlKeyword = async () => {
  if (!urlKeyword.trim() || urlKeyword.length < 2) {
    toast.error("Please enter a keyword with at least 2 characters")
    return
  }
  setIsScanningUrlKeyword(true)
  setUrlKeywordResults(null)
  try {
    const response = await fetch("/api/admin/scan-url-keyword", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ keyword: urlKeyword.trim() }),
    })
    const data = await response.json()
    if (response.ok) {
      setUrlKeywordResults(data)
      toast.success(`Found ${data.summary.uniqueUrls} unique URLs containing "${urlKeyword}"`)
    } else {
      toast.error(data.error || "Failed to scan URLs")
    }
  } catch {
    toast.error("Failed to scan URLs")
  } finally {
    setIsScanningUrlKeyword(false)
  }
}

const downloadUrlKeywordResults = () => {
  if (!urlKeywordResults) return
  
  const csv = [
    ["Hostname", "Pathname", "Count", "Full URL"],
    ...urlKeywordResults.matches.map((m: any) => [m.hostname, m.pathname, m.count, m.fullUrl]),
  ]
  .map((row) => row.map((cell) => `"${cell}"`).join(","))
  .join("\n")

  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `url-keyword-${urlKeywordResults.keyword}-${new Date().toISOString().split("T")[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
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

  const handleReassignSubstack = async () => {
    setIsReassigningSubstack(true)
    setReassignSubstackResults(null)
    try {
      const response = await fetch("/api/admin/reassign-substack", {
        method: "POST",
        credentials: "include",
      })
      const data = await response.json()
      if (response.ok) {
        setReassignSubstackResults(data)
        toast.success(
          `Substack reassignment done: ${data.unassigned} unassigned, ${data.reassigned} reassigned, ${data.unmatched} unmatched`
        )
      } else {
        toast.error(data.error || "Failed to reassign Substack campaigns")
      }
    } catch {
      toast.error("Failed to reassign Substack campaigns")
    } finally {
      setIsReassigningSubstack(false)
    }
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
    if (!testUrl.trim()) {
      toast.error("Please enter a URL to test")
      return
    }

    setIsTestingUrl(true)
    setTestUrlResults(null)

    try {
      const response = await fetch("/api/admin/test-unwrap-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: testUrl.trim() }),
      })

      const data = await response.json()

      if (response.ok) {
        setTestUrlResults(data)
        if (data.final.changed) {
          toast.success(`URL unwrapped successfully (${data.redirectChain.totalSteps} steps)`)
        } else {
          toast.info("URL already at final destination")
        }
      } else {
        toast.error(data.error || "Failed to unwrap URL")
      }
    } catch (error) {
      console.error("Failed to unwrap URL:", error)
      toast.error("Failed to unwrap URL")
    } finally {
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

  const handleRemoveFinalURL = async () => {
    setIsRemovingFinalURL(true)
    setRemoveFinalURLResults(null)
    try {
      const response = await fetch("/api/admin/remove-final-url-uppercase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      })
      const data = await response.json()
      if (response.ok && data.success) {
        setRemoveFinalURLResults(data.summary)
        toast.success(`Removed ${data.summary.totalLinksRemoved} "finalURL" keys across ${data.summary.emailCampaignsUpdated + data.summary.smsMessagesUpdated} records`)
      } else {
        toast.error(data.error || "Failed to remove finalURL keys")
      }
    } catch {
      toast.error("Failed to remove finalURL keys")
    } finally {
      setIsRemovingFinalURL(false)
    }
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

  const handleBackfillDonationPlatform = async (dryRun = false) => {
    setIsBackfillingPlatform(true)
    setPlatformBackfillResults(null)
    try {
      const response = await fetch("/api/admin/backfill-donation-platform", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      })
      const data = await response.json()
      if (response.ok) {
        setPlatformBackfillResults(data)
        toast.success(
          dryRun
            ? `Dry run: would update ${data.summary.updated} of ${data.summary.processed} campaigns`
            : `Done: ${data.summary.updated} campaigns updated (${data.summary.processed} processed)`
        )
      } else {
        toast.error(data.error || "Backfill failed")
      }
    } catch {
      toast.error("Backfill failed")
    } finally {
      setIsBackfillingPlatform(false)
    }
  }

  const handleDkimAudit = async () => {
    setIsDkimAuditing(true)
    setDkimAuditResults(null)
    try {
      const res = await fetch("/api/admin/dkim-selector-audit")
      const data = await res.json()
      if (res.ok) {
        setDkimAuditResults(data)
        toast.success(`Found ${data.uniqueSelectors} unique DKIM selectors across ${data.totalEmails.toLocaleString()} emails`)
      } else {
        toast.error(data.error || "Audit failed")
      }
    } catch {
      toast.error("Audit failed")
    } finally {
      setIsDkimAuditing(false)
    }
  }

  const handleAddDkimMapping = async (selector: string) => {
    const name = dkimNewName[selector]?.trim()
    if (!name) {
      toast.error("Enter a provider name first")
      return
    }
    setAddingSelector(selector)
    try {
      const res = await fetch("/api/admin/dkim-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectorValue: selector, friendlyName: name }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Added: ${selector} → ${name}`)
        // Update local results to reflect the new mapping
        setDkimAuditResults((prev) =>
          prev
            ? {
                ...prev,
                unmappedCount: prev.unmappedCount - 1,
                results: prev.results.map((r) =>
                  r.selector === selector ? { ...r, mappedTo: name } : r
                ),
              }
            : prev
        )
        setDkimNewName((prev) => { const n = { ...prev }; delete n[selector]; return n })
      } else {
        toast.error(data.error || "Failed to add mapping")
      }
    } catch {
      toast.error("Failed to add mapping")
    } finally {
      setAddingSelector(null)
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

      {/* ── Following Digest Trigger ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail size={16} />
            Trigger Following Digest
          </CardTitle>
          <CardDescription>
            Manually send the daily following digest to all RIP users (or override the recipient for testing).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Email override (optional)</label>
              <Input
                placeholder="test@example.com"
                value={digestEmailOverride}
                onChange={(e) => setDigestEmailOverride(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Days back (1 = yesterday)</label>
              <Input
                type="number"
                min="0"
                max="30"
                value={digestDateOffset}
                onChange={(e) => setDigestDateOffset(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <Button onClick={handleTriggerDigest} disabled={isTriggeringDigest} className="gap-2">
            {isTriggeringDigest ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail size={16} />
                Send Digest Now
              </>
            )}
          </Button>
          {digestTriggerResult && (
            <div className="mt-3 p-3 rounded-md bg-muted text-sm space-y-1">
              <p className="font-medium">
                {digestTriggerResult.window?.label} — {digestTriggerResult.sent} sent, {digestTriggerResult.failed} failed
              </p>
              {digestTriggerResult.results.map((r, i) => (
                <p key={i} className="text-muted-foreground text-xs">
                  {r.sent ? "✓" : "✗"} {r.email} — {r.entityCount} entities, {r.messageCount} messages
                </p>
              ))}
            </div>
          )}
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
          <CardTitle>Fix SMS Receiving Numbers</CardTitle>
          <CardDescription>
            Updates all existing SMS records to use the correct receiving phone number from rawData (fixes toNumber field)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleMigrateSMSNumbers} disabled={isMigratingSMSNumbers} className="gap-2">
            {isMigratingSMSNumbers ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Migrating...
              </>
            ) : (
              <>
                <Play size={16} />
                Fix SMS Numbers
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
          <CardTitle>Reassign Substack Campaigns</CardTitle>
          <CardDescription>
            Unassigns all Substack campaigns, then reassigns them using only explicit{" "}
            <code>donationIdentifiers.substack</code> matches. Fixes any false-positive assignments from the old
            fuzzy name-matching logic.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleReassignSubstack}
            disabled={isReassigningSubstack}
            className="gap-2"
          >
            {isReassigningSubstack ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Reassign All Substack Campaigns
          </Button>
          {reassignSubstackResults && (
            <div className="text-sm space-y-2">
              <p className="font-medium">
                {reassignSubstackResults.unassigned} unassigned &rarr; {reassignSubstackResults.reassigned} reassigned,{" "}
                {reassignSubstackResults.unmatched} left unmatched
              </p>
              {reassignSubstackResults.samples.length > 0 && (
                <div className="space-y-1">
                  <p className="text-muted-foreground font-medium">Sample assignments:</p>
                  {reassignSubstackResults.samples.map((s) => (
                    <div key={s.campaignId} className="text-xs text-muted-foreground">
                      &ldquo;{s.subject}&rdquo; &rarr; {s.entity}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
          <CardTitle>Redact SMS Links</CardTitle>
          <CardDescription>
            Retroactively replace all URLs in existing SMS message bodies with "[Omitted Link]". Catches both
            https:// links and bare domain URLs like 76pac.com/9k7Tfrh. Links are preserved in the CTA Links
            section. Run a dry run first to preview changes before applying.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleRedactSMSLinks(true)}
              disabled={isRedactingSMSLinks}
              className="gap-2"
            >
              {isRedactingSMSLinks ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Dry Run (Preview)
            </Button>
            <Button
              onClick={() => handleRedactSMSLinks(false)}
              disabled={isRedactingSMSLinks}
              className="gap-2"
            >
              {isRedactingSMSLinks ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
              Redact All SMS Links
            </Button>
          </div>
          {redactSMSLinksResults && (
            <div className="text-sm space-y-2">
              <p className="font-medium">
                {redactSMSLinksResults.dryRun ? "Dry run results:" : "Results:"} {redactSMSLinksResults.updated} updated,{" "}
                {redactSMSLinksResults.skipped} already clean (of {redactSMSLinksResults.total} total)
              </p>
              {redactSMSLinksResults.samples.length > 0 && (
                <div className="space-y-2">
                  <p className="text-muted-foreground font-medium">Sample changes:</p>
                  {redactSMSLinksResults.samples.map((s) => (
                    <div key={s.id} className="rounded border p-2 text-xs space-y-1">
                      <p className="text-muted-foreground">Before: {s.before}</p>
                      <p>After: {s.after}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
          <CardTitle>Auto-Populate ActBlue Identifiers</CardTitle>
          <CardDescription>
            Automatically extract and populate ActBlue donation identifiers from existing campaigns for ALL entities.
            Scans campaigns and SMS messages for both <code>secure.actblue.com/donate/</code> and{" "}
            <code>secure.actblue.com/contribute/page/</code> URL patterns and stores the identifiers for future
            auto-assignment. Safe to re-run — only adds new identifiers, never removes existing ones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleAutoPopulateActBlue} disabled={isAutoPopulatingActBlue} className="gap-2">
            {isAutoPopulatingActBlue ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Auto-Populating...
              </>
            ) : (
              <>
                <Play size={16} />
                Auto-Populate ActBlue Identifiers
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auto-Populate PSQ Impact Identifiers</CardTitle>
          <CardDescription>
            Automatically extract and populate PSQ Impact donation identifiers from existing campaigns for ALL entities.
            Scans campaigns and SMS messages for <code>secure.psqimpact.com/donate/</code> URL patterns and stores the
            entity-slug identifiers for future auto-assignment. Safe to re-run — only adds new identifiers, never removes existing ones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleAutoPopulatePSQ} disabled={isAutoPopulatingPSQ} className="gap-2">
            {isAutoPopulatingPSQ ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Auto-Populating...
              </>
            ) : (
              <>
                <Play size={16} />
                Auto-Populate PSQ Impact Identifiers
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auto-Populate Engage Identifiers</CardTitle>
          <CardDescription>
            Automatically extract and populate Engage donation identifiers from existing campaigns for ALL entities. Scans campaigns and SMS messages for <code>engage.{"{identifier}"}.com</code> URL patterns and stores the domain identifiers for future auto-assignment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleAutoPopulateEngage} disabled={isAutoPopulatingEngage} className="gap-2">
            {isAutoPopulatingEngage ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Auto-Populating...
              </>
            ) : (
              <>
                <Play size={16} />
                Auto-Populate Engage Identifiers
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
          <CardTitle>Scan URLs by Keyword</CardTitle>
          <CardDescription>
            Search all campaigns and SMS messages for URLs containing a specific keyword. Useful for discovering
            new donation platforms or URL patterns (e.g., &quot;engage&quot;, &quot;contribute&quot;, &quot;donate&quot;).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter keyword (e.g., engage, contribute, revv)"
              value={urlKeyword}
              onChange={(e) => setUrlKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScanUrlKeyword()}
              className="max-w-sm"
            />
            <Button onClick={handleScanUrlKeyword} disabled={isScanningUrlKeyword} className="gap-2">
              {isScanningUrlKeyword ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Scan URLs
                </>
              )}
            </Button>
          </div>

          {urlKeywordResults && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">Results for &quot;{urlKeywordResults.keyword}&quot;</p>
                <div>
                  <span className="text-muted-foreground">Unique URLs:</span>
                  <span className="ml-2 font-medium">{urlKeywordResults.summary.uniqueUrls}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Occurrences:</span>
                  <span className="ml-2 font-medium">{urlKeywordResults.summary.totalOccurrences}</span>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground mb-2">By Hostname:</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {Object.entries(urlKeywordResults.summary.hostnames).map(([hostname, data]: [string, any]) => (
                    <div key={hostname} className="text-sm flex justify-between">
                      <span className="font-mono">{hostname}</span>
                      <span className="text-muted-foreground">{data.count} occurrences ({data.urls} unique)</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Showing {Math.min(urlKeywordResults.matches.length, 100)} of {urlKeywordResults.summary.uniqueUrls} URLs
                </p>
                <Button variant="outline" size="sm" onClick={downloadUrlKeywordResults}>
                  Download CSV
                </Button>
              </div>

              <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Full URL</th>
                      <th className="text-right p-2 font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {urlKeywordResults.matches.map((match: any, index: number) => (
                      <tr key={index} className="border-b last:border-b-0">
                        <td className="p-2 font-mono text-xs break-all">
                          <a 
                            href={match.fullUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            {match.fullUrl}
                          </a>
                        </td>
                        <td className="p-2 text-right">{match.count}</td>
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
          <CardTitle>Remove Legacy "finalURL" Keys</CardTitle>
          <CardDescription>
            Scans all CTA links in CompetitiveInsightCampaign and SmsQueue and removes any{" "}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">finalURL</code> (uppercase) keys. The
            canonical field is{" "}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">finalUrl</code> (camelCase) and will not
            be touched. Once removed, the unwrap CRON will re-process those links cleanly on its next pass.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleRemoveFinalURL}
            disabled={isRemovingFinalURL}
            variant="destructive"
            className="gap-2"
          >
            {isRemovingFinalURL ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Scanning & removing...
              </>
            ) : (
              'Remove "finalURL" Keys'
            )}
          </Button>
          {removeFinalURLResults && (
            <div className="rounded-md border p-4 space-y-3 text-sm">
              <p className="font-medium">Results</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground">
                <span>Email campaigns updated</span>
                <span className="font-mono text-foreground">{removeFinalURLResults.emailCampaignsUpdated}</span>
                <span>Email campaigns skipped</span>
                <span className="font-mono text-foreground">{removeFinalURLResults.emailCampaignsSkipped}</span>
                <span>Email "finalURL" keys removed</span>
                <span className="font-mono text-foreground">{removeFinalURLResults.emailLinksRemoved}</span>
                <span>SMS messages updated</span>
                <span className="font-mono text-foreground">{removeFinalURLResults.smsMessagesUpdated}</span>
                <span>SMS messages skipped</span>
                <span className="font-mono text-foreground">{removeFinalURLResults.smsMessagesSkipped}</span>
                <span>SMS "finalURL" keys removed</span>
                <span className="font-mono text-foreground">{removeFinalURLResults.smsLinksRemoved}</span>
              </div>
              <p className="font-medium pt-1">
                Total "finalURL" keys removed:{" "}
                <span className="text-destructive">{removeFinalURLResults.totalLinksRemoved}</span>
              </p>
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

      {/* Donation Platform Backfill */}
      <Card>
        <CardHeader>
          <CardTitle>Backfill Donation Platform</CardTitle>
          <CardDescription>
            Scans all email campaigns and sets the <code>donationPlatform</code> column based on links found in{" "}
            <code>ctaLinks</code>. Detection order: PSQ &rarr; ActBlue &rarr; Anedot &rarr; WinRed (PSQ takes priority
            because PSQ emails frequently contain WinRed store/merch links that are not donation links).
            Run a dry run first to preview counts before writing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleBackfillDonationPlatform(true)}
              disabled={isBackfillingPlatform}
            >
              {isBackfillingPlatform ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Dry Run
            </Button>
            <Button
              onClick={() => handleBackfillDonationPlatform(false)}
              disabled={isBackfillingPlatform}
            >
              {isBackfillingPlatform ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Run Backfill
            </Button>
          </div>

          {platformBackfillResults && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Processed", value: platformBackfillResults.summary.processed },
                  { label: platformBackfillResults.dryRun ? "Would Update" : "Updated", value: platformBackfillResults.summary.updated, highlight: "green" },
                  { label: "Already Set", value: platformBackfillResults.summary.alreadySet },
                  { label: "No Match", value: platformBackfillResults.summary.noMatch },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className="rounded-lg border p-3 text-center">
                    <div className={`text-2xl font-bold ${highlight === "green" ? "text-green-600" : ""}`}>{value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{label}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border p-3 space-y-1">
                <h4 className="text-sm font-semibold mb-2">By Platform</h4>
                {Object.entries(platformBackfillResults.summary.byPlatform).map(([platform, count]) => (
                  <div key={platform} className="flex justify-between text-sm">
                    <span className="capitalize font-medium">{platform}</span>
                    <span>{count as number}</span>
                  </div>
                ))}
              </div>

              {platformBackfillResults.samples.length > 0 && (
                <div className="rounded-lg border p-3 space-y-1">
                  <h4 className="text-sm font-semibold mb-2">Sample Matches (first 20)</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {platformBackfillResults.samples.map((s) => (
                      <div key={s.id} className="flex gap-2 text-xs">
                        <span className="capitalize shrink-0 font-medium w-16">{s.platform}</span>
                        <span className="text-muted-foreground truncate">{s.subject}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sending IP Audit */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sending IP Audit</CardTitle>
          <CardDescription>
            Scan all emails with raw headers and count unique sending IPs (from <code className="text-xs bg-muted px-1 py-0.5 rounded">Received-SPF</code> / <code className="text-xs bg-muted px-1 py-0.5 rounded">Authentication-Results</code>). Use this to identify which ESPs are being used.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleDkimAudit}
            disabled={isDkimAuditing}
            variant="outline"
          >
            {isDkimAuditing ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Play size={14} className="mr-2" />}
            {isDkimAuditing ? "Scanning..." : "Run Audit"}
          </Button>

          {dkimAuditResults && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex gap-6 text-sm">
                  <div><span className="text-muted-foreground">Emails scanned:</span> <strong>{dkimAuditResults.totalEmails.toLocaleString()}</strong></div>
                  <div><span className="text-muted-foreground">With IP:</span> <strong>{(dkimAuditResults.totalWithIp ?? dkimAuditResults.totalEmails).toLocaleString()}</strong></div>
                  <div><span className="text-muted-foreground">Unique IPs:</span> <strong>{dkimAuditResults.uniqueIps ?? dkimAuditResults.uniqueSelectors}</strong></div>
                  {(dkimAuditResults.noIpCount ?? 0) > 0 && (
                    <div><span className="text-muted-foreground">No IP found:</span> <strong className="text-amber-500">{dkimAuditResults.noIpCount}</strong></div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const rows = [
                      ["Sending IP", "Count", "Percentage of Total"],
                      ...dkimAuditResults.results.map((r: any) => [
                        r.ip ?? r.selector,
                        r.count,
                        `${r.percentage}%`,
                      ]),
                    ]
                    const csv = rows.map((r) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")
                    const blob = new Blob([csv], { type: "text/csv" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = url
                    a.download = `sending-ip-audit-${new Date().toISOString().slice(0, 10)}.csv`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  Export CSV
                </Button>
              </div>

              <div className="border rounded-md divide-y">
                <div className="grid grid-cols-[1fr_100px_80px] gap-3 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                  <span>Sending IP</span>
                  <span className="text-right">Count</span>
                  <span className="text-right">%</span>
                </div>
                {dkimAuditResults.results.map((r: any) => (
                  <div key={r.ip ?? r.selector} className="grid grid-cols-[1fr_100px_80px] gap-3 px-3 py-2 items-center text-sm">
                    <span className="font-mono text-xs">{r.ip ?? r.selector}</span>
                    <span className="text-right tabular-nums">{r.count.toLocaleString()}</span>
                    <span className="text-right tabular-nums text-muted-foreground">{r.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Twitter/X Post ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Twitter size={18} />
            Post to Twitter/X
          </CardTitle>
          <CardDescription>
            Scores all emails and SMS from the last 24 hours by engagement (share views, shares, views, follower count in system) and posts the top result to Twitter/X.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={async () => {
              setIsPostingTweet(true)
              setTweetResult(null)
              try {
                const res = await fetch("/api/admin/twitter-post", { method: "POST" })
                const data = await res.json()
                if (res.ok) {
                  setTweetResult(data)
                  toast.success(`Posted tweet for ${data.entity}`)
                } else {
                  toast.error(data.error || "Failed to post tweet")
                }
              } catch {
                toast.error("Failed to post tweet")
              } finally {
                setIsPostingTweet(false)
              }
            }}
            disabled={isPostingTweet}
            className="gap-2"
          >
            {isPostingTweet ? <Loader2 size={15} className="animate-spin" /> : <Twitter size={15} />}
            {isPostingTweet ? "Selecting & posting..." : "Post Best Tweet Now"}
          </Button>

          {tweetResult && (
            <div className="rounded-md border p-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Tweet posted successfully</span>
                <span className="text-xs text-muted-foreground capitalize bg-muted px-2 py-0.5 rounded">{tweetResult.type}</span>
              </div>
              <div className="bg-muted/50 rounded p-3 text-sm italic text-foreground leading-relaxed">
                {tweetResult.tweetText}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div><span className="font-medium text-foreground">Entity:</span> {tweetResult.entity}</div>
                <div><span className="font-medium text-foreground">Score:</span> {tweetResult.score}</div>
                <div><span className="font-medium text-foreground">Candidates evaluated:</span> {tweetResult.candidatesEvaluated}</div>
                <div>
                  <a href={tweetResult.shareUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                    Share page
                  </a>
                </div>
              </div>
              {tweetResult.tweetUrl && (
                <a
                  href={tweetResult.tweetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:underline"
                >
                  <Twitter size={12} />
                  View tweet on X
                </a>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
