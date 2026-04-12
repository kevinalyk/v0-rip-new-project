"use client"

import { useState } from "react"
import { useParams, notFound } from "next/navigation"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { AppLayout } from "@/components/app-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MapPin, X, Mail, MessageSquare, Activity } from "lucide-react"
import type { StateActivity } from "@/components/us-interactive-map"

// Dynamically import the map to avoid SSR issues with react-simple-maps
const USInteractiveMap = dynamic(
  () => import("@/components/us-interactive-map").then((m) => m.USInteractiveMap),
  { ssr: false }
)

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Reverse map for looking up full name from abbreviation in side panel
const ABBREV_TO_FULL: Record<string, string> = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California",
  CO:"Colorado", CT:"Connecticut", DE:"Delaware", FL:"Florida", GA:"Georgia",
  HI:"Hawaii", ID:"Idaho", IL:"Illinois", IN:"Indiana", IA:"Iowa", KS:"Kansas",
  KY:"Kentucky", LA:"Louisiana", ME:"Maine", MD:"Maryland", MA:"Massachusetts",
  MI:"Michigan", MN:"Minnesota", MS:"Mississippi", MO:"Missouri", MT:"Montana",
  NE:"Nebraska", NV:"Nevada", NH:"New Hampshire", NJ:"New Jersey", NM:"New Mexico",
  NY:"New York", NC:"North Carolina", ND:"North Dakota", OH:"Ohio", OK:"Oklahoma",
  OR:"Oregon", PA:"Pennsylvania", RI:"Rhode Island", SC:"South Carolina",
  SD:"South Dakota", TN:"Tennessee", TX:"Texas", UT:"Utah", VT:"Vermont",
  VA:"Virginia", WA:"Washington", WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming",
  DC:"District of Columbia",
}

export default function CIMapPage() {
  const params = useParams()
  const clientSlug = params.clientSlug as string

  // Only RIP can access this page
  if (clientSlug !== "rip") {
    notFound()
  }

  const [selectedState, setSelectedState] = useState<string | null>(null)

  // Poll activity data every 60 seconds
  const { data, isLoading } = useSWR<{ activity: StateActivity[]; since: string }>(
    "/api/ci/map-activity",
    fetcher,
    { refreshInterval: 60_000 }
  )

  const activity: StateActivity[] = data?.activity ?? []
  const totalActive = activity.length
  const totalEmails = activity.reduce((s, a) => s + a.emailCount, 0)
  const totalSms = activity.reduce((s, a) => s + a.smsCount, 0)

  // Find activity for the currently selected state
  const selectedActivity = selectedState
    ? activity.find((a) => ABBREV_TO_FULL[a.state] === selectedState)
    : null

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={false}>
      <div className="flex flex-col h-full min-h-screen bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-[#EB3847]" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Interactive Map</h1>
              <p className="text-sm text-muted-foreground">
                Pulsing dots show states with activity in the last 24 hours.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Live summary badges */}
            {!isLoading && totalActive > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="flex items-center gap-1.5 text-xs">
                  <Activity className="h-3 w-3 text-[#EB3847]" />
                  {totalActive} active state{totalActive !== 1 ? "s" : ""}
                </Badge>
                {totalEmails > 0 && (
                  <Badge variant="outline" className="flex items-center gap-1.5 text-xs">
                    <Mail className="h-3 w-3" />
                    {totalEmails} email{totalEmails !== 1 ? "s" : ""}
                  </Badge>
                )}
                {totalSms > 0 && (
                  <Badge variant="outline" className="flex items-center gap-1.5 text-xs">
                    <MessageSquare className="h-3 w-3" />
                    {totalSms} SMS
                  </Badge>
                )}
              </div>
            )}
            {selectedState && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1 text-sm">
                  <MapPin className="h-3 w-3 text-[#EB3847]" />
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
        </div>

        {/* Map area */}
        <div className="flex flex-1 gap-6 p-6">
          {/* Map card */}
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardContent className="flex-1 p-4" style={{ minHeight: 480 }}>
              <USInteractiveMap
                selectedState={selectedState}
                onStateSelect={setSelectedState}
                activityData={activity}
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
                  <div className="space-y-3">
                    <p className="text-lg font-semibold">{selectedState}</p>
                    {selectedActivity ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Activity in the last 24h:</p>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Mail className="h-3.5 w-3.5" /> Emails
                            </span>
                            <span className="font-semibold text-[#EB3847]">{selectedActivity.emailCount}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <MessageSquare className="h-3.5 w-3.5" /> SMS
                            </span>
                            <span className="font-semibold text-[#EB3847]">{selectedActivity.smsCount}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm border-t border-border pt-1.5 mt-0.5">
                            <span className="text-muted-foreground">Total</span>
                            <span className="font-bold">{selectedActivity.total}</span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Last activity{" "}
                          {new Date(selectedActivity.latestAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No activity in the last 24 hours.
                      </p>
                    )}
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
                    Click a state on the map to see its activity.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Activity breakdown — top states */}
            {activity.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Top States (24h)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[...activity]
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 5)
                    .map((item) => (
                      <div key={item.state} className="flex items-center justify-between text-sm">
                        <button
                          className="text-left hover:text-[#EB3847] transition-colors font-medium"
                          onClick={() => setSelectedState(ABBREV_TO_FULL[item.state] ?? item.state)}
                        >
                          {ABBREV_TO_FULL[item.state] ?? item.state}
                        </button>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {item.emailCount > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Mail className="h-3 w-3" />{item.emailCount}
                            </span>
                          )}
                          {item.smsCount > 0 && (
                            <span className="flex items-center gap-0.5">
                              <MessageSquare className="h-3 w-3" />{item.smsCount}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
            )}

            {/* Legend */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Legend
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#EB3847] animate-pulse shrink-0" />
                  Pulsing dot = activity in last 24h
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-block w-2.5 h-2.5 rounded bg-[#EB3847] shrink-0" />
                  Solid red fill = selected state
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Refreshes every 60 seconds automatically.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
