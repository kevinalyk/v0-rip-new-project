"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Activity, Users, UserX, Globe, RefreshCw, Clock } from "lucide-react"

interface TrafficData {
  summary: {
    totalVisits: number
    authenticatedVisits: number
    anonymousVisits: number
    uniqueVisitors: number
    uniqueUsers: number
    days: number
  }
  byCountry: Array<{ country: string; count: number }>
  topAnonymousIps: Array<{ ip: string; country: string | null; city: string | null; count: number }>
  topUsers: Array<{ email: string | null; count: number }>
  visitsPerDay: Array<{ date: string; authenticated: number; anonymous: number }>
  recentVisits: Array<{
    id: string
    ip: string
    userAgent: string | null
    referer: string | null
    path: string
    statusCode: number | null
    userEmail: string | null
    isAuthenticated: boolean
    country: string | null
    city: string | null
    createdAt: string
  }>
}

export function SiteTrafficContent() {
  const [data, setData] = useState<TrafficData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState("7")

  const fetchData = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/site-traffic?days=${days}`, {
        credentials: "include"
      })
      if (!response.ok) throw new Error("Failed to fetch")
      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      setError("Failed to load traffic data. Make sure the SiteVisit table migration has been run.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [days])

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  const truncateUserAgent = (ua: string | null) => {
    if (!ua) return "-"
    if (ua.length > 60) return ua.substring(0, 60) + "..."
    return ua
  }

  const formatPath = (path: string) => {
    // Filter out API calls and other noise
    if (path.startsWith('/api/')) return null
    if (path === '/login') return null
    
    return path
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-destructive">{error}</p>
          <Button onClick={fetchData} className="mt-4">Retry</Button>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const authPercent = data.summary.totalVisits > 0 
    ? Math.round((data.summary.authenticatedVisits / data.summary.totalVisits) * 100) 
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Site Traffic</h1>
          <p className="text-muted-foreground">Monitor visitor activity and identify potential leads</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Visits</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.totalVisits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Last {data.summary.days} days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Authenticated</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.authenticatedVisits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{authPercent}% of visits</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Anonymous</CardTitle>
            <UserX className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.anonymousVisits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{100 - authPercent}% of visits</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique IPs</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.uniqueVisitors.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Distinct visitors</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.uniqueUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Logged in users</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Top Anonymous IPs */}
        <Card>
          <CardHeader>
            <CardTitle>Top Anonymous Visitors</CardTitle>
            <CardDescription>IPs without accounts - potential leads or bots</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topAnonymousIps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No anonymous visits yet
                    </TableCell>
                  </TableRow>
                ) : (
                  data.topAnonymousIps.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">{item.ip}</TableCell>
                      <TableCell>
                        {item.city && item.country 
                          ? `${item.city}, ${item.country}`
                          : item.country || "-"}
                      </TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Most Active Users */}
        <Card>
          <CardHeader>
            <CardTitle>Most Active Users</CardTitle>
            <CardDescription>Logged in users by visit count</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      No authenticated visits yet
                    </TableCell>
                  </TableRow>
                ) : (
                  data.topUsers.map((user, i) => (
                    <TableRow key={i}>
                      <TableCell>{user.email || "-"}</TableCell>
                      <TableCell className="text-right">{user.count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Visits by Country */}
        <Card>
          <CardHeader>
            <CardTitle>Visits by Country</CardTitle>
            <CardDescription>Geographic distribution of visitors</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byCountry.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      No geographic data yet
                    </TableCell>
                  </TableRow>
                ) : (
                  data.byCountry.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell>{item.country}</TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Daily Visits */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Visits</CardTitle>
            <CardDescription>Visits per day breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Auth</TableHead>
                  <TableHead className="text-right">Anon</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.visitsPerDay.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No visits yet
                    </TableCell>
                  </TableRow>
                ) : (
                  data.visitsPerDay.map((day, i) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(day.date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right text-green-600">{day.authenticated}</TableCell>
                      <TableCell className="text-right text-orange-600">{day.anonymous}</TableCell>
                      <TableCell className="text-right font-medium">{day.authenticated + day.anonymous}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Recent Visits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Visits
          </CardTitle>
          <CardDescription>Latest 50 visits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>User Agent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentVisits.map((visit) => {
                  const formattedPath = formatPath(visit.path)
                  
                  return (
                    <TableRow key={visit.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(visit.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={visit.isAuthenticated ? "default" : "secondary"}>
                          {visit.statusCode}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{visit.ip}</TableCell>
                      <TableCell>
                        {visit.city && visit.country 
                          ? `${visit.city}, ${visit.country}`
                          : visit.country || "-"}
                      </TableCell>
                      <TableCell>
                        {visit.userEmail ? (
                          <span className="text-green-600">{visit.userEmail}</span>
                        ) : (
                          <span className="text-muted-foreground">Anonymous</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs">
                        {formattedPath ? (
                          <span className="font-mono text-blue-600">{formattedPath}</span>
                        ) : (
                          <span className="text-muted-foreground italic">API/Auth</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {truncateUserAgent(visit.userAgent)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
