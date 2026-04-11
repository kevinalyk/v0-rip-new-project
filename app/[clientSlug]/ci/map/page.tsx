"use client"

import { useState } from "react"
import { useParams, notFound } from "next/navigation"
import dynamic from "next/dynamic"
import { AppLayout } from "@/components/app-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MapPin, X } from "lucide-react"

// Dynamically import the map to avoid SSR issues with react-simple-maps
const USInteractiveMap = dynamic(
  () => import("@/components/us-interactive-map").then((m) => m.USInteractiveMap),
  { ssr: false }
)

export default function CIMapPage() {
  const params = useParams()
  const clientSlug = params.clientSlug as string

  // Only RIP can access this page
  if (clientSlug !== "rip") {
    notFound()
  }

  const [selectedState, setSelectedState] = useState<string | null>(null)

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={false}>
      <div className="flex flex-col h-full min-h-screen bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-[#dc2a28]" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Interactive Map</h1>
              <p className="text-sm text-muted-foreground">
                Click any state to select it. More data coming soon.
              </p>
            </div>
          </div>
          {selectedState && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1 text-sm">
                <MapPin className="h-3 w-3 text-[#dc2a28]" />
                {selectedState}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedState(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Map area */}
        <div className="flex flex-1 gap-6 p-6">
          {/* Map card */}
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardContent className="flex-1 p-4" style={{ minHeight: 480 }}>
              <USInteractiveMap
                selectedState={selectedState}
                onStateSelect={setSelectedState}
              />
            </CardContent>
          </Card>

          {/* State info panel */}
          <div className="w-64 shrink-0 flex flex-col gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Selected State
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedState ? (
                  <div className="space-y-2">
                    <p className="text-lg font-semibold">{selectedState}</p>
                    <p className="text-xs text-muted-foreground">
                      Activity data and engagement metrics will appear here once connected.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-muted-foreground px-0 text-xs"
                      onClick={() => setSelectedState(null)}
                    >
                      <X className="h-3 w-3 mr-1" /> Clear selection
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Click a state on the map to select it.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Coming Soon
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Live activity dots will appear on states as new emails and SMS messages arrive — staying visible for 24 hours before fading.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
