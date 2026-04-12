"use client"

import { useState } from "react"
import { useParams, notFound } from "next/navigation"
import dynamic from "next/dynamic"
import { AppLayout } from "@/components/app-layout"
import { X, Radio } from "lucide-react"

const USInteractiveMap = dynamic(
  () => import("@/components/us-interactive-map").then((m) => m.USInteractiveMap),
  { ssr: false }
)

const STATE_ABBREV: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL",
  Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA",
  Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN",
  Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
}

export default function CIMapPage() {
  const params = useParams()
  const clientSlug = params.clientSlug as string

  if (clientSlug !== "rip") notFound()

  const [selectedState, setSelectedState] = useState<string | null>(null)

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={false}>
      <div className="flex flex-col h-full min-h-screen bg-background">

        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-[#EB3847]" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EB3847]" />
              </span>
              <span className="text-xs font-mono font-medium text-[#EB3847] uppercase tracking-widest">Live</span>
            </div>
            <span className="text-muted-foreground text-xs">|</span>
            <h1 className="text-sm font-semibold tracking-tight">Media Activity Map</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <Radio className="h-3 w-3" />
            <span>Monitoring all 50 states</span>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">

          {/* Map — takes all remaining space */}
          <div className="flex-1 relative bg-background p-4">
            {/* Subtle grid overlay for "radar screen" feel */}
            <div
              className="absolute inset-4 rounded-lg pointer-events-none z-0 opacity-[0.03]"
              style={{
                backgroundImage: `
                  linear-gradient(to right, oklch(0.62 0.22 20) 1px, transparent 1px),
                  linear-gradient(to bottom, oklch(0.62 0.22 20) 1px, transparent 1px)
                `,
                backgroundSize: "40px 40px",
              }}
            />
            <div className="relative z-10 w-full h-full" style={{ minHeight: 480 }}>
              <USInteractiveMap
                selectedState={selectedState}
                onStateSelect={setSelectedState}
              />
            </div>
          </div>

          {/* Right intel panel */}
          <div className="w-60 shrink-0 border-l border-border flex flex-col font-mono">

            {/* Selected state readout */}
            <div className="p-4 border-b border-border">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Selected State</p>
              {selectedState ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-[#EB3847] leading-none">
                        {STATE_ABBREV[selectedState] ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{selectedState}</p>
                    </div>
                    <button
                      onClick={() => setSelectedState(null)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="border border-border rounded p-2 space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">Emails (24h)</span>
                      <span className="text-foreground">—</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">SMS (24h)</span>
                      <span className="text-foreground">—</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">Entities</span>
                      <span className="text-foreground">—</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Click any state on the map to inspect it.
                </p>
              )}
            </div>

            {/* Activity feed — placeholder */}
            <div className="p-4 flex-1 flex flex-col gap-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Recent Activity</p>
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
                <div className="h-8 w-8 rounded-full border border-dashed border-border flex items-center justify-center">
                  <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Live activity dots are coming soon. New emails and SMS will appear here as they arrive.
                </p>
              </div>
            </div>

            {/* Footer status */}
            <div className="p-3 border-t border-border">
              <p className="text-[10px] text-muted-foreground font-mono">
                Activity window: <span className="text-foreground">24h</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
