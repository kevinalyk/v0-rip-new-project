"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Save, Info, CheckCircle } from "lucide-react"
import { toast } from "sonner"
import AppLayout from "@/components/app-layout"

export default function AccountSettingsPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string
  const isAdminRoute = clientSlug === "admin"

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [retentionPeriod, setRetentionPeriod] = useState("90")
  const [saving, setSaving] = useState(false)
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientName, setClientName] = useState<string>("System")

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
      setUser(userData)

      // Check if first login
      if (userData.firstLogin) {
        router.push("/reset-password")
        return
      }

      // If not admin route, verify access to this client
      if (!isAdminRoute) {
        const verifyResponse = await fetch(`/api/client/verify-access?clientSlug=${clientSlug}`, {
          credentials: "include",
        })

        if (!verifyResponse.ok) {
          // No access to this client
          if (userData.role === "super_admin") {
            router.push("/admin")
          } else if (userData.clientSlug) {
            router.push(`/${userData.clientSlug}`)
          } else {
            router.push("/login")
          }
          return
        }
      } else {
        // Admin route - verify super_admin
        if (userData.role !== "super_admin") {
          if (userData.clientSlug) {
            router.push(`/${userData.clientSlug}`)
          } else {
            router.push("/login")
          }
          return
        }
      }

      // Fetch client and settings
      await fetchClientAndSettings(userData)
    } catch (error) {
      console.error("Auth check failed:", error)
      router.push("/login")
    }
  }

  const fetchClientAndSettings = async (userData: any) => {
    try {
      // Get client ID from user or from first domain
      let fetchedClientId: string | null = null

      if (userData.clientId) {
        // User has a client assigned
        fetchedClientId = userData.clientId

        // Fetch client details
        const clientResponse = await fetch(`/api/clients/${userData.clientId}`, {
          credentials: "include",
        })

        if (clientResponse.ok) {
          const clientData = await clientResponse.json()
          setClientName(clientData.name)
        }
      } else {
        setClientName("System")
      }

      setClientId(fetchedClientId)

      // Fetch settings for this client
      if (fetchedClientId) {
        const settingsUrl = `/api/settings?clientId=${fetchedClientId}`
        const response = await fetch(settingsUrl, { credentials: "include" })

        if (response.ok) {
          const settings = await response.json()
          if (settings.retention_period) {
            setRetentionPeriod(settings.retention_period.toString())
          }
        }
      }
    } catch (error) {
      console.error("Error fetching settings:", error)
      toast.error("Failed to load settings")
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    if (!clientId) {
      toast.error("No client assigned")
      return
    }

    try {
      setSaving(true)
      const url = `/api/settings?clientId=${clientId}`

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          retention_period: retentionPeriod,
        }),
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to save settings")
      }

      toast.success("Settings saved successfully")
    } catch (error) {
      console.error("Error saving settings:", error)
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
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
            <h2 className="text-lg font-medium">{clientName} Settings</h2>
            <p className="text-muted-foreground">
              Configure settings for {clientName}. These settings apply to all domains owned by this client.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Data Retention</CardTitle>
              <CardDescription>
                Configure how long campaign data and email results are stored before being automatically cleaned up.
                This setting applies to all domains owned by {clientName}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="retention">Data Retention Period</Label>
                  <Select value={retentionPeriod} onValueChange={setRetentionPeriod}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select retention period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 days (1 month)</SelectItem>
                      <SelectItem value="60">60 days (2 months)</SelectItem>
                      <SelectItem value="90">90 days (3 months)</SelectItem>
                      <SelectItem value="120">120 days (4 months)</SelectItem>
                      <SelectItem value="180">180 days (6 months)</SelectItem>
                      <SelectItem value="365">365 days (1 year)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Individual email results and detailed processing data will be automatically deleted after this
                    period. Campaign summaries and statistics will be preserved.
                  </p>
                </div>
              </div>

              <div className="rounded-md border p-4 bg-muted/30">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-500" />
                  What gets cleaned up?
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Individual email delivery results and placement data</li>
                  <li>Detailed forwarded email content and headers</li>
                  <li>Raw email processing logs and metadata</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Note:</strong> Campaign summaries, seed list emails, and user accounts are not affected by
                  this setting.
                </p>
              </div>

              <div className="flex items-center gap-2 p-3 border rounded-lg bg-green-50 dark:bg-green-900/20">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div className="text-sm">
                  <span className="font-medium text-green-800 dark:text-green-200">Current setting: </span>
                  <span className="text-green-700 dark:text-green-300">
                    Data will be retained for {retentionPeriod} days
                    {retentionPeriod === "30" && " (1 month)"}
                    {retentionPeriod === "60" && " (2 months)"}
                    {retentionPeriod === "90" && " (3 months)"}
                    {retentionPeriod === "120" && " (4 months)"}
                    {retentionPeriod === "180" && " (6 months)"}
                    {retentionPeriod === "365" && " (1 year)"}
                  </span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="bg-rip-red hover:bg-rip-red/90 text-white"
                onClick={handleSaveSettings}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} className="mr-2" />
                    Save Settings
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
