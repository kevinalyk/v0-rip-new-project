"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Search, Eye, EyeOff, AlertCircle, CheckCircle } from "lucide-react"

export default function LookupSignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const passwordOk = password.length >= 8
  const passwordsMatch = password === confirm && confirm.length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!passwordOk) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/lookup/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Signup failed. Please try again.")
        return
      }

      router.push("/lookup")
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center px-4">
      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="bg-[#eb3847] rounded-lg p-2">
            <Search className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-semibold text-lg leading-tight">
            Who&apos;s Contacting Me?
          </span>
        </div>
        <p className="text-[#8b8fa8] text-sm text-center">
          Free account required to run searches
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-8 shadow-2xl">
        <h1 className="text-white text-xl font-semibold mb-1">Create your account</h1>
        <p className="text-[#8b8fa8] text-sm mb-6">
          It&apos;s free. No credit card required.
        </p>

        {error && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-5">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-red-400 text-sm leading-relaxed">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[#c8cad8] text-sm font-medium">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-4 py-2.5 text-white placeholder-[#4a4d5e] text-sm focus:outline-none focus:border-[#eb3847] focus:ring-1 focus:ring-[#eb3847] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-[#c8cad8] text-sm font-medium">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-4 py-2.5 pr-10 text-white placeholder-[#4a4d5e] text-sm focus:outline-none focus:border-[#eb3847] focus:ring-1 focus:ring-[#eb3847] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4a4d5e] hover:text-[#8b8fa8] transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {password.length > 0 && (
              <p className={`text-xs flex items-center gap-1 ${passwordOk ? "text-green-400" : "text-[#8b8fa8]"}`}>
                {passwordOk ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <AlertCircle className="w-3 h-3" />
                )}
                At least 8 characters
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm" className="text-[#c8cad8] text-sm font-medium">
              Confirm password
            </label>
            <div className="relative">
              <input
                id="confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-4 py-2.5 pr-10 text-white placeholder-[#4a4d5e] text-sm focus:outline-none focus:border-[#eb3847] focus:ring-1 focus:ring-[#eb3847] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4a4d5e] hover:text-[#8b8fa8] transition-colors"
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirm.length > 0 && (
              <p className={`text-xs flex items-center gap-1 ${passwordsMatch ? "text-green-400" : "text-red-400"}`}>
                {passwordsMatch ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <AlertCircle className="w-3 h-3" />
                )}
                {passwordsMatch ? "Passwords match" : "Passwords do not match"}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-[#eb3847] hover:bg-[#d42f3c] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
          >
            {loading ? "Creating account..." : "Create free account"}
          </button>
        </form>

        <p className="mt-6 text-center text-[#8b8fa8] text-sm">
          Already have an account?{" "}
          <Link href="/lookup/login" className="text-[#eb3847] hover:text-[#d42f3c] font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>

      <p className="mt-8 text-[#4a4d5e] text-xs text-center max-w-xs">
        By creating an account you agree to our{" "}
        <a href="/terms" className="hover:text-[#8b8fa8] transition-colors underline">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" className="hover:text-[#8b8fa8] transition-colors underline">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  )
}
