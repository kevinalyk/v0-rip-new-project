"use client"

import { useState, useRef } from "react"
import { usePathname } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Paperclip, X, CheckCircle } from "lucide-react"

interface ReportProblemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReportProblemDialog({ open, onOpenChange }: ReportProblemDialogProps) {
  const pathname = usePathname()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState("")
  const [details, setDetails] = useState("")
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    if (file && file.size > 10 * 1024 * 1024) {
      setError("Screenshot must be under 10MB")
      return
    }
    setScreenshot(file)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError("Please enter a title describing the problem.")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("title", title.trim())
      formData.append("pageUrl", window.location.href)
      if (details.trim()) formData.append("details", details.trim())
      if (screenshot) formData.append("screenshot", screenshot)

      const res = await fetch("/api/support/ticket", {
        method: "POST",
        credentials: "include",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Submission failed")
      }

      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    // Reset after close animation
    setTimeout(() => {
      setTitle("")
      setDetails("")
      setScreenshot(null)
      setError(null)
      setSubmitted(false)
    }, 300)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle className="text-green-500" size={48} />
            <div>
              <h2 className="text-lg font-semibold">Thanks for the report!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                We've received your ticket and will look into it shortly.
              </p>
            </div>
            <Button onClick={handleClose} className="mt-2">
              Close
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Report a Problem</DialogTitle>
              <DialogDescription>
                Describe what went wrong and we'll look into it.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rp-title">
                  What's the problem? <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rp-title"
                  placeholder="e.g. Filter isn't working on the CI feed"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={submitting}
                  maxLength={200}
                />
              </div>

              {/* Details — optional */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rp-details">
                  Details{" "}
                  <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                </Label>
                <Textarea
                  id="rp-details"
                  placeholder="Any extra context — steps to reproduce, what you expected to see, etc."
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  disabled={submitting}
                  rows={4}
                  className="resize-none"
                  maxLength={2000}
                />
              </div>

              {/* Screenshot — optional */}
              <div className="flex flex-col gap-1.5">
                <Label>
                  Screenshot{" "}
                  <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                </Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {screenshot ? (
                  <div className="flex items-center gap-2 text-sm border rounded-md px-3 py-2">
                    <Paperclip size={14} className="text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate text-muted-foreground">{screenshot.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setScreenshot(null)
                        if (fileInputRef.current) fileInputRef.current.value = ""
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit gap-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={submitting}
                  >
                    <Paperclip size={14} />
                    Attach screenshot
                  </Button>
                )}
              </div>

              {/* Current page — shown as read-only context */}
              <p className="text-xs text-muted-foreground">
                Page: <span className="font-mono">{pathname}</span>
              </p>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting || !title.trim()}>
                  {submitting ? "Submitting..." : "Submit"}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
