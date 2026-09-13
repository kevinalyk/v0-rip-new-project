"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

const CONSENT_STORAGE_KEY = "rip-cookie-consent"

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const existing = window.localStorage.getItem(CONSENT_STORAGE_KEY)
      if (!existing) {
        setVisible(true)
      }
    } catch {
      // localStorage unavailable (e.g. blocked); skip showing the banner rather than erroring
    }
  }, [])

  function handleChoice(choice: "accepted" | "declined") {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, choice)
    } catch {
      // ignore storage failures
    }
    setVisible(false)
  }

  if (!visible) {
    return null
  }

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-safe"
    >
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <p className="text-sm text-muted-foreground leading-relaxed flex-1">
          We use cookies to operate this site and to support advertising. By continuing to use RIP Tool, you agree to
          our use of cookies as described in our{" "}
          <a href="/privacy" className="underline underline-offset-4 hover:text-foreground transition-colors">
            Privacy Policy
          </a>
          .
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => handleChoice("declined")}>
            Decline
          </Button>
          <Button size="sm" variant="branded" onClick={() => handleChoice("accepted")}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  )
}
