"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Mail, Info, Loader2 } from "lucide-react"
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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Personal Email</h1>
        <p className="text-muted-foreground">
          Emails from seed accounts assigned to your organization appear here.
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Your Email Seeds
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
                    Learn how personal seed email assignments work for competitive intelligence.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <h3 className="font-semibold mb-2">1. Seeds Are Assigned to You</h3>
                    <p className="text-sm text-muted-foreground">
                      Our team assigns specific seed email addresses to your organization. You then use these seeds
                      to sign up for the political campaigns, PACs, and organizations you want to monitor.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">2. Automatic Processing</h3>
                    <p className="text-sm text-muted-foreground">
                      Once your seeds start receiving emails, everything is automatically processed and added to
                      your personal feed.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">3. Personal Badge</h3>
                    <p className="text-sm text-muted-foreground">
                      Messages from your personal seeds appear both here and in the main CI feed with a "Personal"
                      badge, making it easy to identify your exclusive coverage.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">4. Expanded Coverage</h3>
                    <p className="text-sm text-muted-foreground">
                      Use your assigned seeds to sign up for any campaigns or organizations you want to track,
                      giving you targeted email coverage on top of the general CI feed.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
          <CardDescription>
            {hasSeeds
              ? `Email seed accounts assigned to ${assignments?.clientName || "your organization"}`
              : "No email seed accounts are currently assigned to your organization."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading assignments...</span>
            </div>
          ) : hasSeeds ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Assigned Email Seeds ({assignments!.seeds.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {assignments!.seeds.map((seed) => (
                  <Badge key={seed.id} variant="secondary" className="font-mono text-xs">
                    {seed.email}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Contact your administrator to have email seed accounts assigned to your organization.
            </p>
          )}
        </CardContent>
      </Card>

      <CompetitiveInsights
        clientSlug={clientSlug}
        apiEndpoint="/api/ci/personal-email"
        showPersonalBadge={true}
        hideHeader={true}
      />
    </div>
  )
}
