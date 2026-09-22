"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Building2, Check, Loader2, Smartphone, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type SetupData = {
  workspace: { name: string; slug: string }
  requiresWebOnboarding: boolean
}

export default function FinishAccountPage() {
  const router = useRouter()
  const [workspaceName, setWorkspaceName] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetch("/api/account/finish-setup", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login")
          return null
        }
        if (!response.ok) throw new Error("Unable to load your account setup")
        return response.json() as Promise<SetupData>
      })
      .then((data) => {
        if (!data) return
        if (!data.requiresWebOnboarding) {
          router.replace(`/${data.workspace.slug}`)
          return
        }
        setWorkspaceName(data.workspace.name.replace(/\s[a-f0-9]{6}$/i, ""))
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load setup"))
      .finally(() => setLoading(false))
  }, [router])

  async function complete(action: "continue_free" | "upgrade_basic" | "upgrade_professional") {
    setSubmitting(action)
    setError(null)
    try {
      const response = await fetch("/api/account/finish-setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, workspaceName }),
      })
      const data = await response.json() as { error?: string; redirectTo?: string }
      if (!response.ok || !data.redirectTo) throw new Error(data.error || "Unable to finish setup")
      window.location.assign(data.redirectTo)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to finish setup")
      setSubmitting(null)
    }
  }

  if (loading) {
    return <div className="min-h-dvh grid place-items-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="mx-auto max-w-2xl text-center space-y-3">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rip-red/10 text-rip-red">
            <Smartphone className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold">Finish setting up your web account</h1>
          <p className="text-muted-foreground">
            Your Inbox.GOP mobile account includes our free web experience. Confirm your workspace, join an invited organization, or upgrade your web plan.
          </p>
        </div>

        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Your workspace</CardTitle>
            <CardDescription>You can change this name later in account settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="workspaceName">Workspace or organization name</Label>
            <Input id="workspaceName" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} maxLength={100} />
          </CardContent>
        </Card>

        {error ? <p role="alert" className="text-center text-sm text-destructive">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-3">
          <SetupOption
            icon={<Check className="h-6 w-6" />}
            title="Continue free"
            description="Use the free web dashboard. Your Apple Personal plan remains separate and continues to control paid mobile access."
            button="Continue free"
            loading={submitting === "continue_free"}
            disabled={Boolean(submitting)}
            onClick={() => void complete("continue_free")}
          />
          <SetupOption
            icon={<Building2 className="h-6 w-6" />}
            title="Basic — $50/month"
            description="One web user plus complete mobile access. This web plan replaces the need for your $10 Apple Personal subscription."
            button="Choose Basic"
            loading={submitting === "upgrade_basic"}
            disabled={Boolean(submitting)}
            onClick={() => void complete("upgrade_basic")}
          />
          <SetupOption
            icon={<Users className="h-6 w-6" />}
            title="Professional — $300/month"
            description="Web access for your included team members, with complete mobile access for everyone covered by the organization."
            button="Choose Professional"
            loading={submitting === "upgrade_professional"}
            disabled={Boolean(submitting)}
            onClick={() => void complete("upgrade_professional")}
          />
        </div>

        <Card className="mx-auto max-w-2xl border-dashed">
          <CardContent className="pt-6 text-center space-y-2">
            <p className="font-semibold">Joining an existing organization?</p>
            <p className="text-sm text-muted-foreground">
              Ask its account owner to invite this email address, then use the secure invitation link sent to your inbox.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function SetupOption(props: {
  icon: ReactNode
  title: string
  description: string
  button: string
  loading: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="mb-2 text-rip-red">{props.icon}</div>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto">
        <Button className="w-full" variant="branded" onClick={props.onClick} disabled={props.disabled}>
          {props.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {props.button}
        </Button>
      </CardContent>
    </Card>
  )
}
