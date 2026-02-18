"use client"

import type React from "react"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Image from "next/image"

// Create a client component that uses useSearchParams
function ResetPasswordForm({ emailParam = "", tokenParam = "" }) {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState<string>(emailParam)
  const [token, setToken] = useState<string>(tokenParam)
  const [isTokenReset, setIsTokenReset] = useState(!!tokenParam)

  useEffect(() => {
    if (tokenParam) {
      setToken(tokenParam)
      setIsTokenReset(true)
      return
    }

    if (emailParam) {
      setEmail(emailParam)
      return
    }

    // Try to get email from localStorage as fallback
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser)
        if (parsedUser.email) {
          setEmail(parsedUser.email)
          return
        }
      } catch (e) {
        console.error("Error parsing stored user:", e)
      }
    }

    // Fetch current user info
    const fetchUser = async () => {
      try {
        const response = await fetch("/api/auth/me")

        if (!response.ok) {
          window.location.href = "/login"
          return
        }

        const userData = await response.json()
        setEmail(userData.email)

        // If not first login, redirect to dashboard
        if (!userData.firstLogin) {
          window.location.href = "/"
        }
      } catch (error) {
        console.error("Error fetching user:", error)
        window.location.href = "/login"
      }
    }

    fetchUser()
  }, [emailParam, tokenParam, router])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setLoading(true)

    try {
      console.log("Resetting password for:", email)

      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newPassword,
          email: isTokenReset ? undefined : email,
          token: isTokenReset ? token : undefined,
        }),
      })

      const data = await response.json()
      console.log("Reset password response:", response.status, data)

      if (!response.ok) {
        throw new Error(data.error || "Password reset failed")
      }

      // Clear any stored user data
      localStorage.removeItem("user")

      // Redirect to login page with success message
      console.log("Password reset successful, redirecting to login")
      window.location.href = "/login?reset=success"
    } catch (err: any) {
      setError(err.message || "An error occurred while resetting your password")
      console.error(err)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center mb-12">
        <div className="relative w-64 h-64 mx-auto mb-4">
          <Image
            src="/images/FullLogo_Transparent_NoBuffer.png"
            alt="RIP - Republican Inboxing Protocol"
            fill
            style={{ objectFit: "contain" }}
            priority
          />
        </div>
        <h1 className="text-3xl font-bold text-rip-blue mt-2">Republican Inboxing Protocol</h1>
        <p className="mt-4 text-muted-foreground max-w-md">
          Coming soon — A tool dedicated to helping Republicans and conservatives inbox effectively.
        </p>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Reset Your Password</CardTitle>
          <CardDescription>
            {isTokenReset
              ? "Enter your new password below."
              : "This is your first login. Please create a new password to continue."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleResetPassword} className="space-y-4">
            {!isTokenReset && email && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} disabled />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Create a strong password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <div className="text-sm text-muted-foreground">
              Password must be at least 8 characters long and include a mix of letters, numbers, and special characters.
            </div>
            <Button type="submit" variant="branded" className="w-full" disabled={loading}>
              {loading ? "Updating..." : "Set New Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// Create a separate component that uses useSearchParams
function ResetPasswordWithParams() {
  const searchParams = useSearchParams()
  const emailParam = searchParams.get("email") || ""
  const tokenParam = searchParams.get("token") || ""

  // If email param exists, store it in localStorage
  useEffect(() => {
    if (emailParam) {
      localStorage.setItem("user", JSON.stringify({ email: emailParam }))
    }
  }, [emailParam])

  return <ResetPasswordForm emailParam={emailParam} tokenParam={tokenParam} />
}

// Main page component with Suspense
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rip-red"></div>
        </div>
      }
    >
      <ResetPasswordWithParams />
    </Suspense>
  )
}
