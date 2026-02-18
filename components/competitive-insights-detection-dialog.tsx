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
import { Loader2, TrendingUp, AlertCircle, CheckCircle } from "lucide-react"
import { toast } from "sonner"

export function CompetitiveInsightsDetectionDialog({ onDetectionComplete }: { onDetectionComplete?: () => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectionResult, setDetectionResult] = useState<any>(null)
  const [daysToScan, setDaysToScan] = useState(1)
  const [maxEmailsPerSeed, setMaxEmailsPerSeed] = useState(50)

  const handleDetectInsights = async () => {
    try {
      setIsDetecting(true)
      setDetectionResult(null)

      const response = await fetch("/api/campaigns/detect-competitive-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          daysToScan,
          maxEmailsPerSeed,
        }),
        credentials: "include",
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to detect competitive insights")
      }

      setDetectionResult(result)

      if (result.success) {
        toast.success(`Detected ${result.newInsights} competitive insights from ${result.totalEmails} emails`)

        // Call the callback if provided
        if (onDetectionComplete) {
          setTimeout(() => {
            onDetectionComplete()
          }, 2000)
        }
      } else {
        toast.error(result.error || "Failed to detect competitive insights")
      }
    } catch (error) {
      console.error("Error detecting competitive insights:", error)
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
          <TrendingUp size={16} />
          <span>Detect Competitive Insights</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Detect Competitive Insights</DialogTitle>
          <DialogDescription>
            Scan RIP-locked seed emails to detect competitor campaigns and build competitive intelligence.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="daysToScan">Days to Scan</Label>
              <Input
                id="daysToScan"
                type="number"
                min={1}
                max={30}
                value={daysToScan}
                onChange={(e) => setDaysToScan(Number.parseInt(e.target.value) || 1)}
              />
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
            </div>
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
                    ? `Detected ${detectionResult.newInsights} competitive insights from ${detectionResult.totalEmails} emails`
                    : detectionResult.error || "Failed to detect competitive insights"}
                </span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isDetecting}>
            Cancel
          </Button>
          <Button onClick={handleDetectInsights} disabled={isDetecting}>
            {isDetecting ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Detecting...
              </>
            ) : (
              "Detect Insights"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
