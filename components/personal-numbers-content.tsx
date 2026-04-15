"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Smartphone, Info, Loader2, Plus, Minus } from "lucide-react"
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
import { toast } from "sonner"

interface PersonalNumbersContentProps {
  clientSlug: string
}

interface Assignment {
  clientName: string
  seeds: Array<{ id: string; email: string; provider: string | null }>
  phoneNumbers: Array<{ id: string; phoneNumber: string }>
}

interface CurrentUser {
  role: string
}

export function PersonalNumbersContent({ clientSlug }: PersonalNumbersContentProps) {
  const [assignments, setAssignments] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [userLoading, setUserLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [requestDialogOpen, setRequestDialogOpen] = useState(false)
  const [notAdminDialogOpen, setNotAdminDialogOpen] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const [assignmentsRes, userRes] = await Promise.all([
          fetch(`/api/ci/personal/assignments?clientSlug=${encodeURIComponent(clientSlug)}`),
          fetch("/api/debug/user-info", { credentials: "include" }),
        ])

        if (assignmentsRes.ok) {
          setAssignments(await assignmentsRes.json())
        }
        if (userRes.ok) {
          const userData = await userRes.json()
          // role lives at userData.debug.userRole (from /api/debug/user-info)
          const role = userData.debug?.userRole ?? userData.role
          setCurrentUser({ role })
        }
        setUserLoading(false)
      } catch (error) {
        console.error("Error fetching data:", error)
        setUserLoading(false)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [clientSlug])

  const hasPhones = assignments && assignments.phoneNumbers.length > 0
  const canRequest =
    currentUser?.role === "owner" ||
    currentUser?.role === "admin" ||
    currentUser?.role === "super_admin" ||
    currentUser?.role === "super_admin"

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

  const handleRequest = async () => {
    setSubmitting(true)
    try {
      const res = await fetch("/api/ci/request-phone-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ quantity }),
      })

      if (res.ok) {
        toast.success("Request submitted! We'll be in touch shortly.")
        setRequestDialogOpen(false)
        setQuantity(1)
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to submit request")
      }
    } catch {
      toast.error("Failed to submit request")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Personal Numbers</h1>
        <p className="text-muted-foreground">
          SMS messages from phone numbers assigned to your organization appear here.
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Your Phone Numbers
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
                    Learn how personal phone number assignments work for competitive intelligence.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <h3 className="font-semibold mb-2">1. Phone Numbers Are Assigned to You</h3>
                    <p className="text-sm text-muted-foreground">
                      Our team assigns specific phone numbers to your organization as an add-on. You then use these
                      numbers to sign up for SMS lists from the campaigns and organizations you want to monitor.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">2. Automatic Processing</h3>
                    <p className="text-sm text-muted-foreground">
                      Once your numbers start receiving SMS messages, everything is automatically processed and added
                      to your personal numbers feed.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">3. Personal Badge</h3>
                    <p className="text-sm text-muted-foreground">
                      Messages from your personal numbers appear both here and in the main CI feed with a "Personal"
                      badge, making it easy to identify your exclusive SMS coverage.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">4. Add-On Pricing</h3>
                    <p className="text-sm text-muted-foreground">
                      Personal phone numbers are a $100/month add-on per number. Owners and admins can request
                      additional numbers directly from this page.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
          <CardDescription>
            {hasPhones
              ? `Phone numbers assigned to ${assignments?.clientName || "your organization"}`
              : "No phone numbers are currently assigned to your organization."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading assignments...</span>
            </div>
          ) : hasPhones ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  Assigned Phone Numbers ({assignments!.phoneNumbers.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {assignments!.phoneNumbers.map((phone) => (
                  <Badge key={phone.id} variant="secondary" className="font-mono text-xs">
                    {formatPhoneNumber(phone.phoneNumber)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Personal phone numbers are a $100 add-on.{" "}
                <button
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                  onClick={() => canRequest ? setRequestDialogOpen(true) : setNotAdminDialogOpen(true)}
                >
                  Click here to request a number.
                </button>
              </p>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => canRequest ? setRequestDialogOpen(true) : setNotAdminDialogOpen(true)}
              >
                Request a Number
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Phone Number Dialog */}
      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Phone Numbers</DialogTitle>
            <DialogDescription>
              Select how many phone numbers you&apos;d like to add to your organization. Each number is $100/month
              and will be added to your subscription automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-6">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Number of phone numbers</p>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="text-2xl font-bold w-8 text-center">{quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                  disabled={quantity >= 20}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {quantity} number{quantity > 1 ? "s" : ""} &times; $100/month
                </span>
                <span className="font-semibold">${quantity * 100}/month</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                We will automatically update your subscription once the numbers are assigned.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setRequestDialogOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleRequest} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Submitting...
                  </>
                ) : (
                  "Submit Request"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Not admin dialog */}
      <Dialog open={notAdminDialogOpen} onOpenChange={setNotAdminDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request a Number</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Contact your administrator to request a phone number for your organization.
          </p>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setNotAdminDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CompetitiveInsights
        clientSlug={clientSlug}
        apiEndpoint="/api/ci/personal-numbers"
        showPersonalBadge={true}
        hideHeader={true}
      />
    </div>
  )
}
