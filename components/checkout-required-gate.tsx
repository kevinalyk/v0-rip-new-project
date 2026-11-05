"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { CreditCard, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { createTrialCheckoutSession } from "@/app/actions/stripe"

interface CheckoutRequiredGateProps {
  clientId: string
  clientSlug: string
  trialDays: number
  canManageBilling: boolean
}

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((res) => res.json())

function GateContent({ clientId, clientSlug, trialDays, canManageBilling }: CheckoutRequiredGateProps) {
  const searchParams = useSearchParams()
  const returnedFromCheckout = searchParams.get("trialStarted") === "true"
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stripe can redirect back before its webhook has unlocked the account, so poll until it has.
  useSWR(returnedFromCheckout ? "/api/billing" : null, fetcher, {
    refreshInterval: 2000,
    onSuccess: (data) => {
      if (data?.client && data.client.pendingTrialLengthDays == null) {
        window.location.assign(`/${clientSlug}`)
      }
    },
  })

  const handleStartCheckout = async () => {
    try {
      setStarting(true)
      setError(null)
      const { url } = await createTrialCheckoutSession(clientId)
      if (url) {
        window.location.href = url
      }
    } catch (err) {
      console.error("Error starting checkout:", err)
      setError("We couldn't open checkout. Please try again.")
      setStarting(false)
    }
  }

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.href = "/login"
  }

  if (returnedFromCheckout) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <CardTitle>Confirming your payment</CardTitle>
          <CardDescription>This only takes a few seconds. We&apos;ll take you in as soon as it&apos;s confirmed.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const hasTrial = trialDays > 0

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <CreditCard className="h-5 w-5 text-primary" />
        </div>
        <CardTitle>{hasTrial ? "Finish setup to start your free trial" : "Finish checkout to get started"}</CardTitle>
        <CardDescription>
          {hasTrial
            ? `Your account isn't active until you add a card. You won't be charged during your ${trialDays}-day free trial. After that, your card is automatically charged $50/month (plus any applicable tax) for the Basic plan unless you cancel first in Account > Billing.`
            : "Free trials are limited to one per person, so your Basic plan ($50/month plus any applicable tax) is billed when you subscribe. Your account isn't active until checkout is complete. You can cancel anytime in Account > Billing."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!canManageBilling && (
          <p className="text-sm text-muted-foreground">
            Ask the account owner to finish checkout. You&apos;ll get access as soon as they do.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        {canManageBilling && (
          <Button onClick={handleStartCheckout} disabled={starting} className="w-full">
            {starting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting...
              </>
            ) : hasTrial ? (
              "Add Card & Start Free Trial"
            ) : (
              "Continue to Payment"
            )}
          </Button>
        )}
        <Button variant="ghost" onClick={handleSignOut} className="w-full">
          Sign out
        </Button>
      </CardFooter>
    </Card>
  )
}

export function CheckoutRequiredGate(props: CheckoutRequiredGateProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}>
        <GateContent {...props} />
      </Suspense>
    </main>
  )
}
