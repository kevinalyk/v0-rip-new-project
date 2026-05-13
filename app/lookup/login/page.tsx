"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Search, Eye, EyeOff, AlertCircle } from "lucide-react"

export default function LookupLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/lookup/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Login failed. Please try again.")
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
          Sign in to search our political contact database
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-8 shadow-2xl">
        <h1 className="text-white text-xl font-semibold mb-6">Sign in</h1>

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
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-[#eb3847] hover:bg-[#d42f3c] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[#8b8fa8] text-sm">
          Don&apos;t have an account?{" "}
          <Link href="/lookup/signup" className="text-[#eb3847] hover:text-[#d42f3c] font-medium transition-colors">
            Create one free
          </Link>
        </p>
      </div>

      <p className="mt-8 text-[#4a4d5e] text-xs text-center">
        A free tool powered by{" "}
        <a
          href="https://app.rip-tool.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#8b8fa8] transition-colors"
        >
          RIP Tool
        </a>
      </p>
    </div>
  )
}
