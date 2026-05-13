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

  // Push the ad unit once the modal mounts
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
        {/* Close row */}
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

        {/* Ad unit — RIP Tool Pop Up slot (square / auto format) */}
        <div className="p-4 flex items-center justify-center min-h-[300px]" aria-label="Advertisement">
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
  // Build directory slug from entity name (matches existing directory routing)
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
      {/* Avatar */}
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

      {/* Details */}
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

// ─── Results section ────────────────────────────────────────────────────────────

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
          Results for{" "}
          <span className="text-white font-medium">{query}</span>
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

export default function LookupClient({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [results, setResults] = useState<Entity[] | null>(null)
  const [lastQuery, setLastQuery] = useState("")
  const [lastQueryType, setLastQueryType] = useState<"phone" | "email">("phone")
  const [showAdModal, setShowAdModal] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const adModalClosedRef = useRef(false)
  const pendingSearchRef = useRef<string | null>(null)

  // Load history on mount
  useEffect(() => {
    fetch("/api/lookup/history")
      .then((r) => r.json())
      .then((d) => {
        if (d.history) setHistory(d.history)
        setHistoryLoaded(true)
      })
      .catch(() => setHistoryLoaded(true))
  }, [])

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

      if (!res.ok) {
        setError(data.error || "Search failed.")
        return
      }

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

    // Show pop-up ad, then search when it closes (or immediately if already closed)
    adModalClosedRef.current = false
    pendingSearchRef.current = q
    setShowAdModal(true)
  }

  function handleAdClose() {
    setShowAdModal(false)
    adModalClosedRef.current = true
    const q = pendingSearchRef.current
    if (q) {
      pendingSearchRef.current = null
      runSearch(q)
    }
  }

  async function handleLogout() {
    await fetch("/api/lookup/auth/logout", { method: "POST" })
    router.push("/lookup/login")
    router.refresh()
  }

  return (
    <>
      {showAdModal && <AdModal onClose={handleAdClose} />}

      {/* Outer shell — dark background */}
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
              <span className="text-[#8b8fa8] text-xs hidden sm:block truncate max-w-[200px]">
                {userEmail}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-[#8b8fa8] hover:text-white text-xs transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Three-column layout: left ad | content | right ad */}
        <div className="flex flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 gap-6">
          {/* Left sidebar ad */}
          <AdSidebar showAd={true} />

          {/* Main content */}
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

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mt-3">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Results */}
            {results !== null && (
              <SearchResults
                query={lastQuery}
                queryType={lastQueryType}
                results={results}
              />
            )}

            {/* History */}
            {historyLoaded && (
              <HistoryPanel
                history={history}
                onRerun={(q) => {
                  setQuery(q)
                  adModalClosedRef.current = false
                  pendingSearchRef.current = q
                  setShowAdModal(true)
                }}
              />
            )}

            {/* Empty state hint */}
            {results === null && history.length === 0 && (
              <div className="mt-10 text-center">
                <div className="inline-flex items-center gap-2 text-[#4a4d5e] text-sm">
                  <Search className="w-4 h-4" />
                  <span>Enter a number or email above to get started</span>
                </div>
              </div>
            )}
          </main>

          {/* Right sidebar ad */}
          <AdSidebar showAd={true} />
        </div>

        {/* Bottom banner ad */}
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
