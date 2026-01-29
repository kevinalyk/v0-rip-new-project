"use client"

import type React from "react"
import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { RefreshCw } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { ForgotPasswordDialog } from "@/components/forgot-password-dialog"
import { toast } from "sonner"

// Create a client component for the login form
function LoginForm({ successMessage = "" }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [dbStatus, setDbStatus] = useState<"unknown" | "connected" | "disconnected">("unknown")
  const [checkingDb, setCheckingDb] = useState(false)

  useEffect(() => {
    if (successMessage) {
      toast.success(successMessage)
    }
  }, [successMessage])

  useEffect(() => {
    checkDatabaseConnection()
  }, [])

  const checkDatabaseConnection = async () => {
    try {
      setCheckingDb(true)
      const response = await fetch("/api/health")
      const data = await response.json()

      if (response.ok && data.status === "ok") {
        setDbStatus("connected")
      } else {
        setDbStatus("disconnected")
        toast.error("We're experiencing technical difficulties. Please try again in a moment.")
      }
    } catch (err) {
      setDbStatus("disconnected")
      toast.error("We're experiencing technical difficulties. Please try again in a moment.")
    } finally {
      setCheckingDb(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    if (dbStatus !== "connected") {
      await checkDatabaseConnection()
      if (dbStatus !== "connected") {
        toast.error("Service temporarily unavailable. Please try again later.")
        return
      }
    }

    setLoading(true)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Login failed")
      }

      localStorage.setItem("user", JSON.stringify({ email }))

      if (data.user.firstLogin) {
        const form = document.createElement("form")
        form.method = "GET"
        form.action = `/reset-password?email=${encodeURIComponent(email)}`
        document.body.appendChild(form)
        form.submit()
      } else {
        const form = document.createElement("form")
        form.method = "GET"
        form.action = "/"
        document.body.appendChild(form)
        form.submit()
      }
    } catch (err: any) {
      const userMessage = err.message || "Unable to sign in. Please check your credentials and try again."

      toast.error(userMessage)

      if (err.message && (err.message.includes("network") || err.message.includes("fetch"))) {
        setDbStatus("disconnected")
      }

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
          <CardTitle className="text-2xl">Sign in to your account</CardTitle>
          <CardDescription>Enter your email and password to access the RIP tool</CardDescription>
        </CardHeader>
        <CardContent>
          {dbStatus === "disconnected" && (
            <div className="mb-4 p-3 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 flex items-center justify-between">
              <span className="text-sm text-amber-800 dark:text-amber-200">Checking connection...</span>
              <Button
                variant="outline"
                size="sm"
                onClick={checkDatabaseConnection}
                disabled={checkingDb}
                className="h-8 px-2 text-xs bg-transparent"
              >
                {checkingDb ? (
                  <>
                    <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Retry
                  </>
                )}
              </Button>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <ForgotPasswordDialog />
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              variant="branded"
              className="w-full"
              disabled={loading || dbStatus === "disconnected" || checkingDb}
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/signup" className="text-rip-blue hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

function LoginWithParams() {
  const searchParams = useSearchParams()
  const resetSuccess = searchParams.get("reset") === "success"
  const signupSuccess = searchParams.get("signup") === "success"

  const successMessage = resetSuccess
    ? "Password has been reset successfully. Please log in with your new password."
    : signupSuccess
      ? "Account created successfully! Please log in with your credentials."
      : ""

  return <LoginForm successMessage={successMessage} />
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rip-red"></div>
        </div>
      }
    >
      <LoginWithParams />
    </Suspense>
  )
}
