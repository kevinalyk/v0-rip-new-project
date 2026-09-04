"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { X, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"

interface MeResponse {
  client?: {
    slug: string
    trialExpiresAt: string | null
    trialEndedNoticeSeen: boolean
  }
  iat?: number
}

const fetcher = (url: string) => fetch(url).then((res) => (res.ok ? res.json() : null))
const DISMISS_STORAGE_KEY = "trialBannerDismissedIat"

// Shows a dismissible top-of-page banner while a code-redeemed trial is active ("X days left"),
// and — separately — a one-time modal the first time a client logs in after their trial expired.
// The active-trial banner reappears on every login (tracked via the JWT's per-login `iat` claim
// cached in localStorage) but stays hidden across page loads/reloads within the same login once
// dismissed. The "trial ended" modal is tracked server-side via trialEndedNoticeSeen instead,
// since it truly only needs to show once ever per trial end, not once per login.
export function TrialStatusBanner() {
  const { data } = useSWR<MeResponse>("/api/auth/me", fetcher)
  const [bannerDismissed, setBannerDismissed] = useState(true)
  const [endedDialogOpen, setEndedDialogOpen] = useState(false)

  const client = data?.client
  const trialExpiresAt = client?.trialExpiresAt ? new Date(client.trialExpiresAt) : null
  const isActiveTrial = !!trialExpiresAt && trialExpiresAt.getTime() > Date.now()

  useEffect(() => {
    if (!isActiveTrial || !data?.iat) {
      setBannerDismissed(true)
      return
    }
    const dismissedIat = window.localStorage.getItem(DISMISS_STORAGE_KEY)
    setBannerDismissed(dismissedIat === String(data.iat))
  }, [isActiveTrial, data?.iat])

  useEffect(() => {
    if (client && client.trialExpiresAt === null && client.trialEndedNoticeSeen === false) {
      setEndedDialogOpen(true)
    }
  }, [client])

  const handleDismissBanner = () => {
    if (data?.iat) {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, String(data.iat))
    }
    setBannerDismissed(true)
  }

  const handleCloseEndedDialog = () => {
    setEndedDialogOpen(false)
    fetch("/api/client/dismiss-trial-notice", { method: "POST" }).catch(() => {})
  }

  const daysLeft = trialExpiresAt
    ? Math.max(1, Math.ceil((trialExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0

  return (
    <>
      {isActiveTrial && !bannerDismissed && (
        <div className="flex items-center gap-3 bg-primary px-4 py-2.5 text-primary-foreground">
          <Sparkles className="h-4 w-4 flex-shrink-0" />
          <p className="flex-1 text-sm font-medium">
            You&apos;re on a free trial — {daysLeft} day{daysLeft === 1 ? "" : "s"} left.{" "}
            <Link href={`/${client?.slug}/account/billing`} className="underline underline-offset-2 hover:no-underline">
              Subscribe now
            </Link>
          </p>
          <button
            type="button"
            onClick={handleDismissBanner}
            aria-label="Dismiss trial banner"
            className="flex-shrink-0 rounded-sm opacity-80 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Dialog open={endedDialogOpen} onOpenChange={(open) => !open && handleCloseEndedDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your free trial has ended</DialogTitle>
            <DialogDescription>
              Subscribe to keep unlimited users, full reporting, and all filters. Your account is currently on the
              free Starter plan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseEndedDialog}>
              Maybe later
            </Button>
            <Button asChild onClick={handleCloseEndedDialog}>
              <Link href={`/${client?.slug}/account/billing`}>Subscribe now</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
