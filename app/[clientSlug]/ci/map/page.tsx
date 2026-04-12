"use client"

import { useState } from "react"
import { useParams, notFound } from "next/navigation"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { AppLayout } from "@/components/app-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MapPin, X, Mail, MessageSquare, Activity, Clock, User } from "lucide-react"
import type { StateActivity } from "@/components/us-interactive-map"

// Full state name -> abbreviation reverse lookup
const FULL_TO_ABBREV: Record<string, string> = {
  Alabama:"AL", Alaska:"AK", Arizona:"AZ", Arkansas:"AR", California:"CA",
  Colorado:"CO", Connecticut:"CT", Delaware:"DE", Florida:"FL", Georgia:"GA",
  Hawaii:"HI", Idaho:"ID", Illinois:"IL", Indiana:"IN", Iowa:"IA", Kansas:"KS",
  Kentucky:"KY", Louisiana:"LA", Maine:"ME", Maryland:"MD", Massachusetts:"MA",
  Michigan:"MI", Minnesota:"MN", Mississippi:"MS", Missouri:"MO", Montana:"MT",
  Nebraska:"NE", Nevada:"NV", "New Hampshire":"NH", "New Jersey":"NJ", "New Mexico":"NM",
  "New York":"NY", "North Carolina":"NC", "North Dakota":"ND", Ohio:"OH", Oklahoma:"OK",
  Oregon:"OR", Pennsylvania:"PA", "Rhode Island":"RI", "South Carolina":"SC",
  "South Dakota":"SD", Tennessee:"TN", Texas:"TX", Utah:"UT", Vermont:"VT",
  Virginia:"VA", Washington:"WA", "West Virginia":"WV", Wisconsin:"WI", Wyoming:"WY",
  "District of Columbia":"DC",
}

interface StateEmail {
  id: string
  subject: string
  senderName: string | null
  senderEmail: string
  createdAt: string
  entity: { id: string; name: string; imageUrl: string | null; type: string } | null
}

interface StateSms {
  id: string
  message: string | null
  phoneNumber: string | null
  createdAt: string
  entity: { id: string; name: string; imageUrl: string | null; type: string } | null
}

interface StateItemsData {
  emails: StateEmail[]
  smsMessages: StateSms[]
  state: string
  since: string
}

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

  // Fetch items for selected state (keyed by state abbreviation)
  const selectedStateAbbrev = selectedState ? FULL_TO_ABBREV[selectedState] : null
  const { data: stateItemsData, isLoading: stateItemsLoading } = useSWR<StateItemsData>(
    selectedStateAbbrev ? `/api/ci/map-state-items?state=${selectedStateAbbrev}` : null,
    fetcher,
    { revalidateOnFocus: false }
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
                Pulsing dots show states with activity in the last 3 hours.
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

        {/* Map + panel area */}
        <div className="flex flex-1 gap-4 p-6 overflow-hidden">

          {/* Map — shrinks when detail panel is open */}
          <div className="flex-1 min-w-0 transition-all duration-300">
            <Card className="h-full">
              <CardContent className="p-4 h-full" style={{ minHeight: 480 }}>
                <USInteractiveMap
                  selectedState={selectedState}
                  onStateSelect={setSelectedState}
                  activityData={activity}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right panel — always present, switches between summary and detail */}
          <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto">

            {/* State detail panel */}
            {selectedState ? (
              <Card className="flex flex-col">
                <CardHeader className="pb-3 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-4 w-4 text-[#EB3847] shrink-0" />
                      <CardTitle className="text-sm font-semibold truncate">{selectedState}</CardTitle>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => setSelectedState(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {selectedActivity && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {selectedActivity.emailCount} email{selectedActivity.emailCount !== 1 ? "s" : ""}
                      </Badge>
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> {selectedActivity.smsCount} SMS
                      </Badge>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-0 flex-1">
                  {stateItemsLoading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                      Loading...
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {/* Emails section */}
                      <div className="px-4 py-3">
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          <Mail className="h-3 w-3" /> Emails ({stateItemsData?.emails.length ?? 0})
                        </h3>
                        {!stateItemsData?.emails.length ? (
                          <p className="text-xs text-muted-foreground">No emails in the last 3h.</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {stateItemsData.emails.map((email) => (
                              <div key={email.id} className="rounded-md border border-border bg-muted/20 p-2.5 hover:bg-muted/40 transition-colors">
                                <div className="flex items-start gap-2">
                                  {email.entity?.imageUrl ? (
                                    <img src={email.entity.imageUrl} alt={email.entity.name} className="h-6 w-6 rounded-full object-cover shrink-0 mt-0.5" />
                                  ) : (
                                    <div className="h-6 w-6 rounded-full bg-[#EB3847]/15 flex items-center justify-center shrink-0 mt-0.5">
                                      <Mail className="h-3 w-3 text-[#EB3847]" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium truncate leading-snug">{email.subject || "(No subject)"}</p>
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                                      {email.entity?.name ?? email.senderName ?? email.senderEmail}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                      <Clock className="h-2.5 w-2.5 shrink-0" />
                                      {new Date(email.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                      {" · "}
                                      {new Date(email.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* SMS section */}
                      <div className="px-4 py-3">
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          <MessageSquare className="h-3 w-3" /> SMS ({stateItemsData?.smsMessages.length ?? 0})
                        </h3>
                        {!stateItemsData?.smsMessages.length ? (
                          <p className="text-xs text-muted-foreground">No SMS in the last 3h.</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {stateItemsData.smsMessages.map((sms) => (
                              <div key={sms.id} className="rounded-md border border-border bg-muted/20 p-2.5 hover:bg-muted/40 transition-colors">
                                <div className="flex items-start gap-2">
                                  {sms.entity?.imageUrl ? (
                                    <img src={sms.entity.imageUrl} alt={sms.entity.name} className="h-6 w-6 rounded-full object-cover shrink-0 mt-0.5" />
                                  ) : (
                                    <div className="h-6 w-6 rounded-full bg-[#EB3847]/15 flex items-center justify-center shrink-0 mt-0.5">
                                      <MessageSquare className="h-3 w-3 text-[#EB3847]" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium truncate">{sms.entity?.name ?? sms.phoneNumber ?? "Unknown sender"}</p>
                                    {sms.message && (
                                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sms.message}</p>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                      <Clock className="h-2.5 w-2.5 shrink-0" />
                                      {new Date(sms.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                      {" · "}
                                      {new Date(sms.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              /* Default summary — shown when no state selected */
              <>
                {activity.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                        Top States (3h)
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

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Legend
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#EB3847] animate-pulse shrink-0" />
                      Pulsing dot = activity in last 3h
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
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
