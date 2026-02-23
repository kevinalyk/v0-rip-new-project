"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Mail, Check, Loader2, Info } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { CompetitiveInsights } from "@/components/competitive-insights"

interface PersonalEmailContentProps {
  clientSlug: string
}

export function PersonalEmailContent({ clientSlug }: PersonalEmailContentProps) {
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const personalEmail = clientSlug ? `${clientSlug}@realdailyreview.com` : ""

  const handleCopy = async () => {
    if (!personalEmail) return

    try {
      await navigator.clipboard.writeText(personalEmail)
      setCopied(true)
      toast({
        title: "Email copied!",
        description: "Your personal email address has been copied to clipboard.",
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy:", error)
      toast({
        title: "Copy failed",
        description: "Please try copying manually.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Personal Email</h1>
        <p className="text-muted-foreground">
          Subscribe to campaigns using your unique email address to expand your competitive intelligence coverage.
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Your Personal Email Address
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
                    Learn how to use your personal email address to expand competitive intelligence coverage.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <h3 className="font-semibold mb-2">1. Subscribe to Campaigns</h3>
                    <p className="text-sm text-muted-foreground">
                      Use your personal email address to subscribe to political campaigns, PACs, or organizations that
                      you want to track.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">2. Automatic Forwarding</h3>
                    <p className="text-sm text-muted-foreground">
                      All emails sent to your personal address are automatically forwarded to our system and processed
                      for competitive intelligence.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">3. View in Your Feed</h3>
                    <p className="text-sm text-muted-foreground">
                      Emails from your personal subscriptions appear below with a "Personal" badge, making it easy to
                      track which campaigns you've added.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">4. Fill the Gaps</h3>
                    <p className="text-sm text-muted-foreground">
                      Our team regularly subscribes to every candidate out there, but sometimes our seeds get
                      suppressed. By using your personal email you help us expand the coverage and ensure we are
                      tracking everyone.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
          <CardDescription>
            Use this email address to subscribe to political campaigns and organizations that aren't in our seed list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-muted px-4 py-3 rounded-md font-mono text-sm">
              {personalEmail || "Loading..."}
            </div>
            <Button onClick={handleCopy} disabled={!personalEmail || copied} className="flex items-center gap-2">
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <CompetitiveInsights clientSlug={clientSlug} apiEndpoint="/api/ci/personal" showPersonalBadge={true} />
    </div>
  )
}
