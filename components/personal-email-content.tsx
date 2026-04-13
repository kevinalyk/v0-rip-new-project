"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Mail, Smartphone, Info } from "lucide-react"
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
                    <h3 className="font-semibold mb-2">1. Admin Assigns Seeds</h3>
                    <p className="text-sm text-muted-foreground">
                      Our team assigns specific seed email addresses and phone numbers to your organization. These seeds
                      are subscribed to political campaigns, PACs, and organizations on your behalf.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">2. Automatic Processing</h3>
                    <p className="text-sm text-muted-foreground">
                      All emails and SMS messages received by your assigned seeds are automatically processed and added
                      to your personal feed.
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
                      Personal seed assignments help ensure you have coverage of specific campaigns or organizations
                      that matter most to your work.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
          <CardDescription>
            This feed shows emails and SMS messages from seed accounts that have been assigned to your organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Contact your administrator if you need additional seed accounts assigned to your organization.
          </p>
        </CardContent>
      </Card>

      <CompetitiveInsights clientSlug={clientSlug} apiEndpoint="/api/ci/personal" showPersonalBadge={true} hideHeader={true} />
    </div>
  )
}
