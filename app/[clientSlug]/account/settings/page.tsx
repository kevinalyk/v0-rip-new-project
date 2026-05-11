"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Loader2, Mail } from "lucide-react"
import { toast } from "sonner"
import AppLayout from "@/components/app-layout"

export default function AccountSettingsPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string
  const isAdminRoute = clientSlug === "admin"

  const [loading, setLoading] = useState(true)
  const [digestEnabled, setDigestEnabled] = useState(true)
  const [savingDigest, setSavingDigest] = useState(false)
  const [weeklyDigestEnabled, setWeeklyDigestEnabled] = useState(true)
  const [savingWeeklyDigest, setSavingWeeklyDigest] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" })

      if (!response.ok) {
        router.push("/login")
        return
      }

      const userData = await response.json()

      if (userData.firstLogin) {
        router.push("/reset-password")
        return
      }

      if (!isAdminRoute) {
        const verifyResponse = await fetch(`/api/client/verify-access?clientSlug=${clientSlug}`, {
          credentials: "include",
        })

        if (!verifyResponse.ok) {
          if (userData.role === "super_admin") {
            router.push("/rip/ci/campaigns")
          } else if (userData.clientSlug) {
            router.push(`/${userData.clientSlug}`)
          } else {
            router.push("/login")
          }
          return
        }
      } else {
        if (userData.role !== "super_admin") {
          if (userData.clientSlug) {
            router.push(`/${userData.clientSlug}`)
          } else {
            router.push("/login")
          }
          return
        }
      }

      await fetchUserSettings()
    } catch (error) {
      console.error("Auth check failed:", error)
      router.push("/login")
    }
  }

  const fetchUserSettings = async () => {
    try {
      const response = await fetch("/api/user/settings", { credentials: "include" })

      if (response.ok) {
        const data = await response.json()
        setDigestEnabled(data.digestEnabled ?? true)
        setWeeklyDigestEnabled(data.weeklyDigestEnabled ?? true)
      }
    } catch (error) {
      console.error("Error fetching user settings:", error)
      toast.error("Failed to load settings")
    } finally {
      setLoading(false)
    }
  }

  const handleWeeklyDigestToggle = async (enabled: boolean) => {
    setWeeklyDigestEnabled(enabled)
    setSavingWeeklyDigest(true)

    try {
      const response = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeklyDigestEnabled: enabled }),
        credentials: "include",
      })

      if (!response.ok) throw new Error("Failed to save")

      toast.success(enabled ? "Weekly digest enabled" : "Weekly digest disabled")
    } catch (error) {
      console.error("Error saving weekly digest setting:", error)
      setWeeklyDigestEnabled(!enabled)
      toast.error("Failed to save setting")
    } finally {
      setSavingWeeklyDigest(false)
    }
  }

  const handleDigestToggle = async (enabled: boolean) => {
    setDigestEnabled(enabled)
    setSavingDigest(true)

    try {
      const response = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digestEnabled: enabled }),
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to save")
      }

      toast.success(
        enabled ? "Daily digest enabled" : "Daily digest disabled"
      )
    } catch (error) {
      console.error("Error saving digest setting:", error)
      setDigestEnabled(!enabled)
      toast.error("Failed to save setting")
    } finally {
      setSavingDigest(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin mx-auto mb-4 text-rip-red" />
          <p>Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={isAdminRoute}>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-medium">Your Settings</h2>
            <p className="text-muted-foreground">
              Manage your personal preferences and notification settings.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>
                Control which emails you receive from Inbox.GOP.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-0">
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <Label htmlFor="digest-toggle" className="text-sm font-medium cursor-pointer">
                      Daily Digest
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive a daily summary of emails and SMS sent by the entities you follow.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-6 shrink-0">
                  {savingDigest && (
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  )}
                  <Switch
                    id="digest-toggle"
                    checked={digestEnabled}
                    onCheckedChange={handleDigestToggle}
                    disabled={savingDigest}
                  />
                </div>
              </div>

              <div className="border-t border-border" />

              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <Label htmlFor="weekly-digest-toggle" className="text-sm font-medium cursor-pointer">
                      Weekly Top 10 Digest
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive a weekly roundup of the top 10 most-viewed emails and SMS from the past 7 days, sent every Sunday.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-6 shrink-0">
                  {savingWeeklyDigest && (
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  )}
                  <Switch
                    id="weekly-digest-toggle"
                    checked={weeklyDigestEnabled}
                    onCheckedChange={handleWeeklyDigestToggle}
                    disabled={savingWeeklyDigest}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
