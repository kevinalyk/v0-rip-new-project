"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle2, Loader2, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Invitation = { organizationName: string; email: string; role: string }

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<InvitationLoadingState />}>
      <AcceptInvitationContent />
    </Suspense>
  )
}

function InvitationLoadingState() {
  return (
    <main className="min-h-dvh grid place-items-center bg-background p-4">
      <Loader2 className="h-8 w-8 animate-spin" />
    </main>
  )
}

function AcceptInvitationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError("Invitation token is missing.")
      setLoading(false)
      return
    }
    void fetch(`/api/auth/client-invitation?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as Invitation & { error?: string }
        if (!response.ok) throw new Error(data.error || "Unable to load invitation")
        setInvitation(data)
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load invitation"))
      .finally(() => setLoading(false))
  }, [token])

  async function accept() {
    setAccepting(true)
    setError(null)
    const response = await fetch("/api/auth/client-invitation", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
    const data = await response.json() as { error?: string; redirectTo?: string }
    if (response.status === 401) {
      router.push(`/login?redirect=${encodeURIComponent(`/accept-invitation?token=${token}`)}`)
      return
    }
    if (!response.ok || !data.redirectTo) {
      setError(data.error || "Unable to accept invitation")
      setAccepting(false)
      return
    }
    window.location.assign(data.redirectTo)
  }

  return (
    <main className="min-h-dvh grid place-items-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-rip-red/10 text-rip-red">
            <Users className="h-6 w-6" />
          </div>
          <CardTitle>Join your organization</CardTitle>
          <CardDescription>
            {invitation ? `${invitation.organizationName} invited ${invitation.email}.` : "Review your Inbox.GOP invitation."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : null}
          {error ? <p role="alert" className="text-center text-sm text-destructive">{error}</p> : null}
          {invitation ? (
            <>
              <div className="flex items-start gap-3 rounded-lg bg-muted p-4 text-sm">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-rip-red" />
                <p>Your personal follows and saved views will move with you. Your mobile credentials stay the same.</p>
              </div>
              <Button variant="branded" className="w-full" disabled={accepting} onClick={() => void accept()}>
                {accepting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Accept invitation
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}
