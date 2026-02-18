"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Search, AlertCircle, CheckCircle } from "lucide-react"
import { toast } from "sonner"

export function CampaignDetectionDialog({ onDetectionComplete }: { onDetectionComplete?: () => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectionResult, setDetectionResult] = useState<any>(null)
  const [daysToScan, setDaysToScan] = useState(1)
  const [minInboxCount, setMinInboxCount] = useState(2)
  const [maxEmailsPerSeed, setMaxEmailsPerSeed] = useState(50)

  const handleDetectCampaigns = async () => {
    try {
      setIsDetecting(true)
      setDetectionResult(null)

      const response = await fetch("/api/campaigns/detect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          daysToScan,
          minInboxCount,
          maxEmailsPerSeed,
        }),
        credentials: "include",
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to detect campaigns")
      }

      setDetectionResult(result)

      if (result.success) {
        toast.success(`Detected ${result.newCampaigns} new campaigns from ${result.totalEmails} emails`)

        // Call the callback if provided
        if (onDetectionComplete) {
          setTimeout(() => {
            onDetectionComplete()
          }, 2000)
        }
      } else {
        toast.error(result.error || "Failed to detect campaigns")
      }
    } catch (error) {
      console.error("Error detecting campaigns:", error)
      toast.error(error instanceof Error ? error.message : "An error occurred")
      setDetectionResult({
        success: false,
        error: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsDetecting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2 bg-transparent">
          <Search size={16} />
          <span>Detect Campaigns</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Detect New Campaigns</DialogTitle>
          <DialogDescription>Scan seed email accounts to automatically detect new campaigns.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="daysToScan">Days to Scan</Label>
              <Input
                id="daysToScan"
                type="number"
                min={1}
                max={7}
                value={daysToScan}
                onChange={(e) => setDaysToScan(Number.parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="minInboxCount">Min Inbox Count</Label>
              <Input
                id="minInboxCount"
                type="number"
                min={1}
                max={10}
                value={minInboxCount}
                onChange={(e) => setMinInboxCount(Number.parseInt(e.target.value) || 2)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="maxEmailsPerSeed">Max Emails Per Seed</Label>
            <Input
              id="maxEmailsPerSeed"
              type="number"
              min={10}
              max={200}
              value={maxEmailsPerSeed}
              onChange={(e) => setMaxEmailsPerSeed(Number.parseInt(e.target.value) || 50)}
            />
            <p className="text-sm text-muted-foreground">
              Limit the number of emails to scan per seed account for performance.
            </p>
          </div>

          {detectionResult && (
            <div className={`p-4 rounded-md ${detectionResult.success ? "bg-green-50" : "bg-red-50"}`}>
              <div className="flex items-center gap-2">
                {detectionResult.success ? (
                  <CheckCircle className="text-green-500" size={16} />
                ) : (
                  <AlertCircle className="text-red-500" size={16} />
                )}
                <span className={detectionResult.success ? "text-green-700" : "text-red-700"}>
                  {detectionResult.success
                    ? `Detected ${detectionResult.newCampaigns} new campaigns from ${detectionResult.totalEmails} emails`
                    : detectionResult.error || "Failed to detect campaigns"}
                </span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isDetecting}>
            Cancel
          </Button>
          <Button onClick={handleDetectCampaigns} disabled={isDetecting}>
            {isDetecting ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Detecting...
              </>
            ) : (
              "Detect Campaigns"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
