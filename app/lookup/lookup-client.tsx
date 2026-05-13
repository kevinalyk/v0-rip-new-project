"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Search,
  X,
  LogOut,
  ExternalLink,
  Clock,
  Phone,
  Mail,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  MapPin,
  Users,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
} from "lucide-react"
import AdBanner from "@/components/ad-banner"
import AdSidebar from "@/components/ad-sidebar"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Entity {
  id: string
  name: string
  type: string
  description: string | null
  party: string | null
  state: string | null
  imageUrl: string | null
  office: string | null
  ballotpediaUrl: string | null
}

interface HistoryItem {
  id: string
  query: string
  queryType: "phone" | "email"
  results: Entity[]
  createdAt: string
}

// ─── Auth Gate Modal ────────────────────────────────────────────────────────────
// Shown when a guest tries to search. Handles signup + login in tabs.
// On success it calls onAuthenticated(email) so the parent can resume the search.

function AuthGateModal({
  onAuthenticated,
  onClose,
  defaultTab = "signup",
}: {
  onAuthenticated: (email: string) => void
  onClose: () => void
  defaultTab?: "signup" | "login"
}) {
  const [tab, setTab] = useState<"signup" | "login">(defaultTab)

  // Shared fields
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function resetForm() {
    setEmail("")
    setPassword("")
    setConfirmPassword("")
    setError("")
    setShowPassword(false)
  }

  function switchTab(next: "signup" | "login") {
    setTab(next)
    resetForm()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (tab === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }

    setLoading(true)
    try {
      const endpoint =
        tab === "signup"
          ? "/api/lookup/auth/signup"
          : "/api/lookup/auth/login"

      const body: Record<string, string> = { email, password }
      if (tab === "signup") body.confirmPassword = confirmPassword

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.")
        return
      }

      onAuthenticated(data.user?.email ?? email)
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-gate-title"
    >
      <div className="relative bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8b8fa8] hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-[#eb3847] rounded-lg p-1.5">
              <Search className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-semibold text-sm">Who&apos;s Contacting Me?</span>
          </div>
          <p id="auth-gate-title" className="text-[#c8cad8] text-sm leading-relaxed mt-2">
            Create a free account to search our database and save your search history.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2a2d3e] mx-6">
          <button
            type="button"
            onClick={() => switchTab("signup")}
            className={`flex-1 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === "signup"
                ? "text-[#eb3847] border-[#eb3847]"
                : "text-[#8b8fa8] border-transparent hover:text-white"
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => switchTab("login")}
            className={`flex-1 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === "login"
                ? "text-[#eb3847] border-[#eb3847]"
                : "text-[#8b8fa8] border-transparent hover:text-white"
            }`}
          >
            Log In
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-3">
          {/* Email */}
          <div>
            <label htmlFor="gate-email" className="block text-[#8b8fa8] text-xs mb-1.5">
              Email address
            </label>
            <input
              id="gate-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2.5 text-white placeholder-[#4a4d5e] text-sm focus:outline-none focus:border-[#eb3847] focus:ring-1 focus:ring-[#eb3847] transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="gate-password" className="block text-[#8b8fa8] text-xs mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="gate-password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2.5 pr-10 text-white placeholder-[#4a4d5e] text-sm focus:outline-none focus:border-[#eb3847] focus:ring-1 focus:ring-[#eb3847] transition-colors"
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

          {/* Confirm password (signup only) */}
          {tab === "signup" && (
            <div>
              <label htmlFor="gate-confirm" className="block text-[#8b8fa8] text-xs mb-1.5">
                Confirm password
              </label>
              <input
                id="gate-confirm"
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2.5 text-white placeholder-[#4a4d5e] text-sm focus:outline-none focus:border-[#eb3847] focus:ring-1 focus:ring-[#eb3847] transition-colors"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-red-400 text-xs leading-relaxed">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#eb3847] hover:bg-[#d42f3c] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition-colors flex items-center justify-center gap-2 mt-1"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {tab === "signup" ? "Creating account..." : "Logging in..."}
              </>
            ) : tab === "signup" ? (
              <>
                <UserPlus className="w-4 h-4" />
                Create Account &amp; Search
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Log In &amp; Search
              </>
            )}
          </button>

          <p className="text-[#4a4d5e] text-xs text-center">
            By signing up you agree to our{" "}
            <a href="/terms" className="hover:text-[#8b8fa8] transition-colors underline">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" className="hover:text-[#8b8fa8] transition-colors underline">
              Privacy Policy
            </a>
            .
          </p>
        </form>
      </div>
    </div>
  )
}

// ─── Pop-up Ad Modal ────────────────────────────────────────────────────────────

function AdModal({ onClose }: { onClose: () => void }) {
  const [countdown, setCountdown] = useState(5)
  const adInitialized = useRef(false)

  useEffect(() => {
    if (countdown <= 0) {
      onClose()
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, onClose])

  useEffect(() => {
    if (adInitialized.current) return
    adInitialized.current = true
    try {
      ;(window as any).adsbygoogle = (window as any).adsbygoogle || []
      ;(window as any).adsbygoogle.push({})
    } catch {
      // AdSense not loaded — safe to ignore
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Advertisement"
    >
      <div className="relative bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2d3e]">
          <span className="text-[#8b8fa8] text-xs uppercase tracking-wider font-medium">
            Advertisement
          </span>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-[#8b8fa8] hover:text-white transition-colors text-xs"
            aria-label="Close advertisement"
          >
            <X className="w-3.5 h-3.5" />
            {countdown > 0 ? `Close in ${countdown}s` : "Close"}
          </button>
        </div>
        <div className="p-4" aria-label="Advertisement">
          <ins
            className="adsbygoogle"
            style={{ display: "block", width: "100%", minHeight: "300px" }}
            data-ad-client="ca-pub-5715074898343065"
            data-ad-slot="1824842850"
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Party badge ─────────────────────────────────────────────────────────────

function PartyBadge({ party }: { party: string | null }) {
  if (!party) return null
  const map: Record<string, { label: string; className: string }> = {
    republican: { label: "Republican", className: "bg-red-500/20 text-red-400 border border-red-500/30" },
    democrat: { label: "Democrat", className: "bg-blue-500/20 text-blue-400 border border-blue-500/30" },
    independent: { label: "Independent", className: "bg-purple-500/20 text-purple-400 border border-purple-500/30" },
  }
  const cfg = map[party.toLowerCase()]
  if (!cfg) return null
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

// ─── Entity card ─────────────────────────────────────────────────────────────

function EntityCard({ entity }: { entity: Entity }) {
  const directorySlug = entity.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")

  const typeLabel =
    entity.type === "politician"
      ? "Politician"
      : entity.type === "pac"
      ? "PAC"
      : entity.type === "organization"
      ? "Organization"
      : entity.type

  return (
    <div className="flex items-start gap-4 bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-5 hover:border-[#eb3847]/40 transition-colors">
      <div className="flex-shrink-0">
        {entity.imageUrl ? (
          <img
            src={entity.imageUrl}
            alt={entity.name}
            className="w-14 h-14 rounded-lg object-cover bg-[#0f1117]"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-[#0f1117] border border-[#2a2d3e] flex items-center justify-center">
            <Users className="w-6 h-6 text-[#4a4d5e]" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h3 className="text-white font-semibold text-base leading-tight text-pretty">
            {entity.name}
          </h3>
          <PartyBadge party={entity.party} />
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <span className="text-[#8b8fa8] text-xs">{typeLabel}</span>
          {entity.state && (
            <span className="flex items-center gap-1 text-[#8b8fa8] text-xs">
              <MapPin className="w-3 h-3" />
              {entity.state}
            </span>
          )}
          {entity.office && (
            <span className="text-[#8b8fa8] text-xs truncate max-w-[200px]">{entity.office}</span>
          )}
        </div>
        {entity.description && (
          <p className="text-[#c8cad8] text-sm leading-relaxed mb-3 line-clamp-2">
            {entity.description}
          </p>
        )}
        <Link
          href={`/directory/${directorySlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[#eb3847] hover:text-[#d42f3c] text-sm font-medium transition-colors"
        >
          View in Directory
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}

// ─── Results section ──���─────────────────────────────────────────────────────────

function SearchResults({
  query,
  queryType,
  results,
}: {
  query: string
  queryType: "phone" | "email"
  results: Entity[]
}) {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-4">
        {queryType === "phone" ? (
          <Phone className="w-4 h-4 text-[#8b8fa8]" />
        ) : (
          <Mail className="w-4 h-4 text-[#8b8fa8]" />
        )}
        <p className="text-[#8b8fa8] text-sm">
          Results for <span className="text-white font-medium">{query}</span>
        </p>
      </div>
      {results.length === 0 ? (
        <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-8 text-center">
          <Search className="w-8 h-8 text-[#4a4d5e] mx-auto mb-3" />
          <p className="text-white font-medium mb-1">No results found</p>
          <p className="text-[#8b8fa8] text-sm leading-relaxed">
            We don&apos;t have any campaigns or political groups matching that{" "}
            {queryType === "phone" ? "phone number" : "email address"} in our database yet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[#8b8fa8] text-xs">
            {results.length} {results.length === 1 ? "group" : "groups"} found
          </p>
          {results.map((entity) => (
            <EntityCard key={entity.id} entity={entity} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── History panel ──────────────────────────────────────────────────────────────

function HistoryPanel({
  history,
  onRerun,
}: {
  history: HistoryItem[]
  onRerun: (query: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (history.length === 0) return null

  return (
    <div className="mt-6 bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#1e2235] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#8b8fa8]" />
          <span className="text-[#c8cad8] text-sm font-medium">
            Recent searches ({history.length})
          </span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-[#8b8fa8]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#8b8fa8]" />
        )}
      </button>
      {open && (
        <div className="border-t border-[#2a2d3e] divide-y divide-[#2a2d3e]">
          {history.slice(0, 20).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onRerun(item.query)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#1e2235] transition-colors group text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                {item.queryType === "phone" ? (
                  <Phone className="w-3.5 h-3.5 text-[#4a4d5e] flex-shrink-0" />
                ) : (
                  <Mail className="w-3.5 h-3.5 text-[#4a4d5e] flex-shrink-0" />
                )}
                <span className="text-[#c8cad8] text-sm truncate group-hover:text-white transition-colors">
                  {item.query}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                <span className="text-[#4a4d5e] text-xs">
                  {item.results.length} result{item.results.length !== 1 ? "s" : ""}
                </span>
                <span className="text-[#4a4d5e] text-xs">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

export default function LookupClient({ userEmail }: { userEmail: string | null }) {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<string | null>(userEmail)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [results, setResults] = useState<Entity[] | null>(null)
  const [lastQuery, setLastQuery] = useState("")
  const [lastQueryType, setLastQueryType] = useState<"phone" | "email">("phone")
  const [showAdModal, setShowAdModal] = useState(false)
  const [showAuthGate, setShowAuthGate] = useState(false)
  const [authGateTab, setAuthGateTab] = useState<"signup" | "login">("signup")
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const pendingSearchRef = useRef<string | null>(null)

  // Load history on mount (only for logged-in users)
  useEffect(() => {
    if (!currentUser) { setHistoryLoaded(true); return }
    fetch("/api/lookup/history")
      .then((r) => r.json())
      .then((d) => { if (d.history) setHistory(d.history); setHistoryLoaded(true) })
      .catch(() => setHistoryLoaded(true))
  }, [currentUser])

  const runSearch = useCallback(async (q: string) => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/lookup/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Search failed."); return }
      setResults(data.results)
      setLastQuery(data.query)
      setLastQueryType(data.queryType)
      // Refresh history
      fetch("/api/lookup/history")
        .then((r) => r.json())
        .then((d) => { if (d.history) setHistory(d.history) })
        .catch(() => {})
    } catch {
      setError("Search failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q || q.length < 3) {
      setError("Please enter a valid phone number or email address.")
      return
    }

    // Gate: if not logged in, show auth modal (signup tab) and remember the query
    if (!currentUser) {
      pendingSearchRef.current = q
      setAuthGateTab("signup")
      setShowAuthGate(true)
      return
    }

    // Logged in — show ad then search
    pendingSearchRef.current = q
    setShowAdModal(true)
  }

  function handleAdClose() {
    setShowAdModal(false)
    const q = pendingSearchRef.current
    if (q) { pendingSearchRef.current = null; runSearch(q) }
  }

  function handleAuthenticated(email: string) {
    setCurrentUser(email)
    setShowAuthGate(false)
    // Load history for the newly logged-in user
    fetch("/api/lookup/history")
      .then((r) => r.json())
      .then((d) => { if (d.history) setHistory(d.history); setHistoryLoaded(true) })
      .catch(() => setHistoryLoaded(true))
    // The query is still in the box — show ad then search
    const q = pendingSearchRef.current
    if (q) {
      setShowAdModal(true)
    }
  }

  async function handleLogout() {
    await fetch("/api/lookup/auth/logout", { method: "POST" })
    setCurrentUser(null)
    setHistory([])
    setResults(null)
    router.refresh()
  }

  return (
    <>
      {showAuthGate && (
        <AuthGateModal
          defaultTab={authGateTab}
          onAuthenticated={handleAuthenticated}
          onClose={() => { setShowAuthGate(false); pendingSearchRef.current = null }}
        />
      )}
      {showAdModal && <AdModal onClose={handleAdClose} />}

      <div className="min-h-screen bg-[#0f1117] flex flex-col">
        {/* Navbar */}
        <header className="border-b border-[#2a2d3e] bg-[#0f1117] sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="bg-[#eb3847] rounded-lg p-1.5">
                <Search className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-semibold text-sm leading-tight hidden sm:block">
                Who&apos;s Contacting Me?
              </span>
            </div>

            <div className="flex items-center gap-3">
              {currentUser ? (
                <>
                  <span className="text-[#8b8fa8] text-xs hidden sm:block truncate max-w-[200px]">
                    {currentUser}
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 text-[#8b8fa8] hover:text-white text-xs transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { pendingSearchRef.current = null; setAuthGateTab("login"); setShowAuthGate(true) }}
                    className="flex items-center gap-1.5 text-[#8b8fa8] hover:text-white text-xs transition-colors"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Log in
                  </button>
                  <button
                    type="button"
                    onClick={() => { pendingSearchRef.current = null; setAuthGateTab("signup"); setShowAuthGate(true) }}
                    className="flex items-center gap-1.5 bg-[#eb3847] hover:bg-[#d42f3c] text-white text-xs font-medium rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Sign up
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Three-column layout */}
        <div className="flex flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 gap-6">
          <AdSidebar showAd={true} />

          <main className="flex-1 min-w-0">
            {/* Hero */}
            <div className="mb-8">
              <h1 className="text-white text-2xl sm:text-3xl font-bold leading-tight text-balance mb-3">
                Who is contacting me?
              </h1>
              <p className="text-[#8b8fa8] text-sm sm:text-base leading-relaxed text-pretty max-w-xl">
                A tool to help you find out what campaign or political group is sending you texts
                and emails. Type in the number or email you are getting messages from below and
                we will search our database for any group that uses it.
              </p>
            </div>

            {/* Search form */}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  {query.includes("@") ? (
                    <Mail className="w-4 h-4 text-[#4a4d5e]" />
                  ) : (
                    <Phone className="w-4 h-4 text-[#4a4d5e]" />
                  )}
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setError("") }}
                  placeholder="Enter a phone number or email address..."
                  className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl pl-10 pr-4 py-3 text-white placeholder-[#4a4d5e] text-sm focus:outline-none focus:border-[#eb3847] focus:ring-1 focus:ring-[#eb3847] transition-colors"
                  aria-label="Phone number or email address"
                />
              </div>
              <button
                type="submit"
                disabled={loading || query.trim().length < 3}
                className="bg-[#eb3847] hover:bg-[#d42f3c] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-5 py-3 text-sm transition-colors flex-shrink-0 flex items-center gap-2"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Searching...
                  </span>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span className="hidden sm:inline">Search</span>
                  </>
                )}
              </button>
            </form>

            {/* Guest nudge — shown below the form when not logged in */}
            {!currentUser && (
              <p className="mt-2 text-[#4a4d5e] text-xs">
                <button
                  type="button"
                  onClick={() => { pendingSearchRef.current = null; setShowAuthGate(true) }}
                  className="text-[#eb3847] hover:underline"
                >
                  Sign up or log in
                </button>{" "}
                to search and save your results.
              </p>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mt-3">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Results */}
            {results !== null && (
              <SearchResults query={lastQuery} queryType={lastQueryType} results={results} />
            )}

            {/* History (logged-in users only) */}
            {currentUser && historyLoaded && (
              <HistoryPanel
                history={history}
                onRerun={(q) => {
                  setQuery(q)
                  pendingSearchRef.current = q
                  setShowAdModal(true)
                }}
              />
            )}

            {/* Empty state */}
            {results === null && history.length === 0 && (
              <div className="mt-10 text-center">
                <div className="inline-flex items-center gap-2 text-[#4a4d5e] text-sm">
                  <Search className="w-4 h-4" />
                  <span>Enter a number or email above to get started</span>
                </div>
              </div>
            )}
          </main>

          <AdSidebar showAd={true} />
        </div>

        {/* Bottom banner */}
        <footer className="border-t border-[#2a2d3e] py-4">
          <AdBanner showAd={true} />
          <p className="text-center text-[#4a4d5e] text-xs mt-3">
            Powered by{" "}
            <a
              href="https://app.rip-tool.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#8b8fa8] transition-colors"
            >
              RIP Tool
            </a>{" "}
            &middot;{" "}
            <a href="/terms" className="hover:text-[#8b8fa8] transition-colors">Terms</a>
            {" "}&middot;{" "}
            <a href="/privacy" className="hover:text-[#8b8fa8] transition-colors">Privacy</a>
          </p>
        </footer>
      </div>
    </>
  )
}
