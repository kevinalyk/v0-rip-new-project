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
  Trash2,
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
      <div className="relative bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-600 hover:text-gray-900 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-red-500 rounded-lg p-1.5">
              <Search className="w-4 h-4 text-gray-900" />
            </div>
            <span className="text-gray-900 font-semibold text-sm">Who&apos;s Contacting Me?</span>
          </div>
          <p id="auth-gate-title" className="text-gray-700 text-sm leading-relaxed mt-2">
            Create a free account to search our database and save your search history.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mx-6">
          <button
            type="button"
            onClick={() => switchTab("signup")}
            className={`flex-1 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === "signup"
                ? "text-red-500 border-red-500"
                : "text-gray-600 border-transparent hover:text-gray-900"
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => switchTab("login")}
            className={`flex-1 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === "login"
                ? "text-red-500 border-red-500"
                : "text-gray-600 border-transparent hover:text-gray-900"
            }`}
          >
            Log In
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-3">
          {/* Email */}
          <div>
            <label htmlFor="gate-email" className="block text-gray-600 text-xs mb-1.5">
              Email address
            </label>
            <input
              id="gate-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="gate-password" className="block text-gray-600 text-xs mb-1.5">
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
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 pr-10 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm password (signup only) */}
          {tab === "signup" && (
            <div>
              <label htmlFor="gate-confirm" className="block text-gray-600 text-xs mb-1.5">
                Confirm password
              </label>
              <input
                id="gate-confirm"
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
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
            className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 font-semibold rounded-lg py-2.5 text-sm transition-colors flex items-center justify-center gap-2 mt-1"
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

          <p className="text-gray-400 text-xs text-center">
            By signing up you agree to our{" "}
            <a href="/terms" className="hover:text-gray-600 transition-colors underline">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" className="hover:text-gray-600 transition-colors underline">
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

    function tryPush() {
      if (adInitialized.current) return
      try {
        const adsbyg = (window as any).adsbygoogle
        if (!adsbyg || !adsbyg.loaded) {
          setTimeout(tryPush, 300)
          return
        }
        adInitialized.current = true
        adsbyg.push({})
      } catch {
        // safe to ignore
      }
    }

    setTimeout(tryPush, 100)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Advertisement"
    >
      <div className="relative bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <span className="text-gray-600 text-xs uppercase tracking-wider font-medium">
            Advertisement
          </span>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 transition-colors text-xs"
            aria-label="Close advertisement"
          >
            {countdown > 0 ? `Close in ${countdown}s` : "Close"}
          </button>
        </div>
        <div className="p-4" aria-label="Advertisement">
          <ins
            className="adsbygoogle"
            style={{ display: "block" }}
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
    <div className="flex items-start gap-4 bg-white border border-gray-200 rounded-xl p-5 hover:border-red-500/40 transition-colors">
      <div className="flex-shrink-0">
        {entity.imageUrl ? (
          <img
            src={entity.imageUrl}
            alt={entity.name}
            className="w-14 h-14 rounded-lg object-cover bg-gray-50"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center">
            <Users className="w-6 h-6 text-gray-400" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h3 className="text-gray-900 font-semibold text-base leading-tight text-pretty">
            {entity.name}
          </h3>
          <PartyBadge party={entity.party} />
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <span className="text-gray-600 text-xs">{typeLabel}</span>
          {entity.state && (
            <span className="flex items-center gap-1 text-gray-600 text-xs">
              <MapPin className="w-3 h-3" />
              {entity.state}
            </span>
          )}
          {entity.office && (
            <span className="text-gray-600 text-xs truncate max-w-[200px]">{entity.office}</span>
          )}
        </div>
        {entity.description && (
          <p className="text-gray-700 text-sm leading-relaxed mb-3 line-clamp-2">
            {entity.description}
          </p>
        )}
        <Link
          href={`/directory/${directorySlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-red-500 hover:text-red-600 text-sm font-medium transition-colors"
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
          <Phone className="w-4 h-4 text-gray-600" />
        ) : (
          <Mail className="w-4 h-4 text-gray-600" />
        )}
        <p className="text-gray-600 text-sm">
          Results for <span className="text-gray-900 font-medium">{query}</span>
        </p>
      </div>
      {results.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <Search className="w-8 h-8 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-900 font-medium mb-1">No results found</p>
          <p className="text-gray-600 text-sm leading-relaxed">
            We don&apos;t have any campaigns or political groups matching that{" "}
            {queryType === "phone" ? "phone number" : "email address"} in our database yet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-gray-600 text-xs">
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

const HISTORY_PAGE_SIZE = 10

// ─── History panel ──────────────────────────────────────────────────────────────

function HistoryPanel({
  history,
  onViewItem,
  onDeleteItem,
  onClearAll,
}: {
  history: HistoryItem[]
  onViewItem: (item: HistoryItem) => void
  onDeleteItem: (id: string) => void
  onClearAll: () => void
}) {
  const [open, setOpen] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  if (history.length === 0) return null

  const totalPages = Math.ceil(history.length / HISTORY_PAGE_SIZE)
  const showPagination = history.length > HISTORY_PAGE_SIZE
  const pageItems = history.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE)

  function handleRowClick(item: HistoryItem) {
    if (expandedId === item.id) {
      setExpandedId(null)
    } else {
      setExpandedId(item.id)
      onViewItem(item) // triggers ad modal in parent
    }
  }

  return (
    <div className="mt-6 bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <Clock className="w-4 h-4 text-gray-600" />
          <span className="text-gray-700 text-sm font-medium">
            Recent searches ({history.length})
          </span>
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-gray-600" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-gray-600" />
          )}
        </button>
        {open && (
          <button
            type="button"
            onClick={onClearAll}
            className="flex items-center gap-1.5 text-gray-400 hover:text-red-400 text-xs transition-colors"
            aria-label="Clear all searches"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear all
          </button>
        )}
      </div>

      {open && (
        <div className="divide-y divide-[#2a2d3e]">
          {pageItems.map((item) => (
            <div key={item.id}>
              {/* Row header */}
              <div className="flex items-center hover:bg-gray-100 transition-colors group">
                <button
                  type="button"
                  onClick={() => handleRowClick(item)}
                  className="flex-1 flex items-center justify-between px-5 py-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.queryType === "phone" ? (
                      <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    ) : (
                      <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    )}
                    <span className="text-gray-700 text-sm truncate group-hover:text-gray-900 transition-colors">
                      {item.query}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    <span className="text-gray-400 text-xs">
                      {item.results.length} result{item.results.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-gray-400 text-xs">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                    {expandedId === item.id ? (
                      <ChevronUp className="w-3.5 h-3.5 text-gray-600" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </div>
                </button>
                {/* Per-row delete */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id) }}
                  className="px-4 py-3 text-gray-400 hover:text-red-400 transition-colors flex-shrink-0"
                  aria-label={`Delete search for ${item.query}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Expanded results */}
              {expandedId === item.id && (
                <div className="px-5 pb-4 bg-[#13151f]">
                  {item.results.length === 0 ? (
                    <p className="text-gray-400 text-xs py-3">
                      No results were found for this search.
                    </p>
                  ) : (
                    <div className="pt-3 space-y-2">
                      {item.results.map((entity) => (
                        <div
                          key={entity.id}
                          className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3"
                        >
                          {entity.imageUrl ? (
                            <img
                              src={entity.imageUrl}
                              alt={entity.name}
                              className="w-8 h-8 rounded object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded bg-[#2a2d3e] flex items-center justify-center flex-shrink-0">
                              <Users className="w-4 h-4 text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-gray-900 text-sm font-medium truncate">{entity.name}</p>
                            <p className="text-gray-600 text-xs capitalize">{entity.type}</p>
                          </div>
                          <a
                            href={`/directory/${entity.name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-red-500 hover:text-red-600 text-xs font-medium flex items-center gap-1 flex-shrink-0 transition-colors"
                          >
                            View
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination — only when >10 items */}
      {open && showPagination && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-400">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2.5 py-1 rounded text-xs text-gray-600 border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                  i === page
                    ? "bg-red-500 text-white border-red-500"
                    : "text-gray-600 border-gray-200 bg-white hover:bg-gray-100"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="px-2.5 py-1 rounded text-xs text-gray-600 border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── FAQ accordion ────────────────────────────────────────────────────────────

const FAQS: { question: string; answer: string }[] = [
  // FAQs will be populated by the user
]

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="mt-12 border-t border-gray-200 pt-10">
      <h2 className="text-center text-gray-900 text-2xl font-bold mb-8">
        Frequently Asked Questions
      </h2>
      <div className="space-y-3 max-w-2xl mx-auto">
        {FAQS.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-4">FAQs coming soon.</p>
        ) : (
          FAQS.map((faq, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-5 text-left"
              >
                <span className="text-gray-800 text-sm font-medium pr-4">{faq.question}</span>
                <span className="text-red-500 text-lg font-light flex-shrink-0 leading-none">
                  {openIndex === i ? "−" : "+"}
                </span>
              </button>
              {openIndex === i && (
                <div className="px-6 pb-5">
                  <p className="text-gray-500 text-sm leading-relaxed">{faq.answer}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

export default function LookupClient({ userEmail }: { userEmail: string | null }) {
  // Force light background on body/html so the dark root theme doesn't bleed through
  useEffect(() => {
    const prev = document.body.style.backgroundColor
    document.documentElement.style.backgroundColor = "#f9fafb"
    document.body.style.backgroundColor = "#f9fafb"
    return () => {
      document.documentElement.style.backgroundColor = ""
      document.body.style.backgroundColor = prev
    }
  }, [])
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
    <div style={{ backgroundColor: "#f9fafb" }}>
      {showAuthGate && (
        <AuthGateModal
          defaultTab={authGateTab}
          onAuthenticated={handleAuthenticated}
          onClose={() => { setShowAuthGate(false); pendingSearchRef.current = null }}
        />
      )}
      {showAdModal && <AdModal onClose={handleAdClose} />}

      <div className="bg-gray-50 flex flex-col min-h-screen" style={{ backgroundColor: "#f9fafb" }}>
        {/* Navbar */}
        <header className="border-b border-gray-200 bg-gray-50 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="bg-red-500 rounded-lg p-1.5">
                <Search className="w-4 h-4 text-gray-900" />
              </div>
              <span className="text-gray-900 font-semibold text-sm leading-tight hidden sm:block">
                Who&apos;s Contacting Me?
              </span>
            </div>

            <div className="flex items-center gap-3">
              {currentUser ? (
                <>
                  <span className="text-gray-600 text-xs hidden sm:block truncate max-w-[200px]">
                    {currentUser}
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 text-xs transition-colors"
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
                    className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 text-xs transition-colors"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Log in
                  </button>
                  <button
                    type="button"
                    onClick={() => { pendingSearchRef.current = null; setAuthGateTab("signup"); setShowAuthGate(true) }}
                    className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-gray-900 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors"
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
        <div className="flex flex-grow max-w-full mx-auto w-full px-2 sm:px-4 py-4 gap-2 sm:gap-4 justify-center items-start">
          {/* Left sidebar */}
          <AdSidebar showAd={true} slot="5401962530" />

          <main className="flex-1 min-w-0 max-w-2xl">
            {/* Hero */}
            <div className="mb-6 text-center">
              <h1 className="text-gray-900 text-2xl sm:text-4xl font-bold leading-tight text-balance mb-3">
                {"Who's Contacting Me?"}
              </h1>
              {/* On mobile show a condensed single paragraph; on desktop show all three */}
              <p className="sm:hidden text-gray-500 text-sm leading-relaxed max-w-xs mx-auto text-left">
                Enter a phone number or email address below and {"we'll"} scan our database to identify which political campaigns are using it. Contact campaigns directly to opt out of their messages.
              </p>
              <div className="hidden sm:block">
                <p className="text-gray-500 text-base leading-relaxed text-pretty max-w-lg mx-auto">
                  Political campaigns send a lot of emails and texts. These messages are a vital way campaigns get their message out so they can win elections, but if you want to opt out we created a simple tool to help.
                </p>
                <p className="text-gray-500 text-base leading-relaxed text-pretty max-w-lg mx-auto mt-3">
                  Below you can enter the number or email you are getting messages from and {"we'll"} scan our database for any campaign using it to send.
                </p>
                <p className="text-gray-500 text-base leading-relaxed text-pretty max-w-lg mx-auto mt-3">
                  The best way to opt out of solicitations is to contact campaigns directly because they are the ones sending the messages.
                </p>
              </div>
            </div>

            {/* Search form */}
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  {query.includes("@") ? (
                    <Mail className="w-4 h-4 text-gray-400" />
                  ) : (
                    <Phone className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setError("") }}
                  placeholder="Enter a phone number or email address..."
                  className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
                  aria-label="Phone number or email address"
                />
              </div>
              <button
                type="submit"
                disabled={loading || query.trim().length < 3}
                className="bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 font-semibold rounded-xl px-5 py-3.5 text-sm transition-colors flex-shrink-0 flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Searching...
                  </span>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Search</span>
                  </>
                )}
              </button>
            </form>

            {/* Guest nudge — shown below the form when not logged in */}
            {!currentUser && (
              <p className="mt-2 text-gray-400 text-xs">
                <button
                  type="button"
                  onClick={() => { pendingSearchRef.current = null; setShowAuthGate(true) }}
                  className="text-red-500 hover:underline"
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
                onViewItem={(item) => {
                  // Show the ad modal when a user expands a past result
                  setShowAdModal(true)
                }}
                onDeleteItem={async (id) => {
                  await fetch(`/api/lookup/history?id=${id}`, { method: "DELETE" })
                  setHistory((prev) => prev.filter((h) => h.id !== id))
                }}
                onClearAll={async () => {
                  await fetch("/api/lookup/history", { method: "DELETE" })
                  setHistory([])
                }}
              />
            )}

            {/* Empty state */}
            {results === null && history.length === 0 && (
              <div className="mt-10 text-center">
                <div className="inline-flex items-center gap-2 text-gray-400 text-sm">
                  <Search className="w-4 h-4" />
                  <span>Enter a number or email above to get started</span>
                </div>
              </div>
            )}

            {/* FAQ Section */}
            <FaqSection />
          </main>

          {/* Right sidebar */}
          <AdSidebar showAd={true} slot="9922824720" />
        </div>

        {/* Bottom banner above the footer line */}
        <AdBanner showAd={true} />

        {/* Footer links below the line */}
        <div className="border-t border-gray-200 py-2">
          <p className="text-center text-gray-400 text-xs">
            Powered by{" "}
            <a
              href="https://inbox.gop"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-600 transition-colors"
            >
              Inbox.GOP
            </a>{" "}
            &middot;{" "}
            <a href="/terms" className="hover:text-gray-600 transition-colors">Terms</a>
            {" "}&middot;{" "}
            <a href="/privacy" className="hover:text-gray-600 transition-colors">Privacy</a>
          </p>
        </div>
      </div>
    </div>
  )
}
