"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Mail, Smartphone, Info, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { CompetitiveInsights } from "@/components/competitive-insights"
import { Badge } from "@/components/ui/badge"

interface PersonalEmailContentProps {
  clientSlug: string
}

interface Assignment {
  clientName: string
  seeds: Array<{ id: string; email: string; provider: string | null }>
  phoneNumbers: Array<{ id: string; phoneNumber: string }>
}

export function PersonalEmailContent({ clientSlug }: PersonalEmailContentProps) {
  const [assignments, setAssignments] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAssignments() {
      try {
        const response = await fetch(`/api/ci/personal/assignments?clientSlug=${encodeURIComponent(clientSlug)}`)
        if (response.ok) {
          const data = await response.json()
          setAssignments(data)
        }
      } catch (error) {
        console.error("Error fetching assignments:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchAssignments()
  }, [clientSlug])

  const hasSeeds = assignments && assignments.seeds.length > 0
  const hasPhones = assignments && assignments.phoneNumbers.length > 0
  const hasAnyAssignments = hasSeeds || hasPhones

  // Format phone number for display
  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "")
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    }
    if (cleaned.length === 11 && cleaned.startsWith("1")) {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
    }
    return phone
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Personal Inbox</h1>
        <p className="text-muted-foreground">
          Emails and SMS messages from seed accounts assigned to your organization appear here.
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <Smartphone className="h-5 w-5" />
            Your Personal Feed
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 ml-1">
                  <Info className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>How It Works</DialogTitle>
                  <DialogDescription>
                    Learn how personal seed assignments work for competitive intelligence.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <h3 className="font-semibold mb-2">1. Seeds Are Assigned to You</h3>
                    <p className="text-sm text-muted-foreground">
                      Our team assigns specific seed email addresses and phone numbers to your organization. You then
                      use these seeds to sign up for the political campaigns, PACs, and organizations you want to
                      monitor.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">2. Automatic Processing</h3>
                    <p className="text-sm text-muted-foreground">
                      Once your seeds start receiving emails and SMS messages, everything is automatically processed
                      and added to your personal feed.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">3. Personal Badge</h3>
                    <p className="text-sm text-muted-foreground">
                      Messages from your personal seeds appear both here and in the main CI feed with a "Personal" badge,
                      making it easy to identify your exclusive coverage.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">4. Expanded Coverage</h3>
                    <p className="text-sm text-muted-foreground">
                      Use your assigned seeds to sign up for any campaigns or organizations you want to track,
                      giving you targeted coverage on top of the general CI feed.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
          <CardDescription>
            {hasAnyAssignments
              ? `Seed accounts assigned to ${assignments?.clientName || "your organization"}`
              : "No seed accounts are currently assigned to your organization."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading assignments...</span>
            </div>
          ) : hasAnyAssignments ? (
            <div className="space-y-4">
              {hasSeeds && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Assigned Email Seeds ({assignments.seeds.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {assignments.seeds.map((seed) => (
                      <Badge key={seed.id} variant="secondary" className="font-mono text-xs">
                        {seed.email}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {hasPhones && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Assigned Phone Numbers ({assignments.phoneNumbers.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {assignments.phoneNumbers.map((phone) => (
                      <Badge key={phone.id} variant="secondary" className="font-mono text-xs">
                        {formatPhoneNumber(phone.phoneNumber)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Contact your administrator to have seed accounts assigned to your organization.
            </p>
          )}
        </CardContent>
      </Card>

      <CompetitiveInsights clientSlug={clientSlug} apiEndpoint="/api/ci/personal" showPersonalBadge={true} hideHeader={true} />
    </div>
  )
}
