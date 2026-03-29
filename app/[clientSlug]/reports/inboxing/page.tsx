"use client"

import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { AppLayout } from "@/components/app-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const INBOX_COLORS = ["#22c55e", "#ef4444"]

interface InboxingData {
  name: string
  value: number
}

export default function InboxingPage() {
  const params = useParams()
  const clientSlug = params.clientSlug as string
  const [inboxingData, setInboxingData] = useState<InboxingData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = new URLSearchParams()
        params.append("clientSlug", clientSlug)
        params.append("days", "30")
        const res = await fetch(`/api/ci/analytics?${params}`, { credentials: "include" })
        if (res.ok) {
          const data = await res.json()
          if (data.inboxingData?.length) {
            setInboxingData(data.inboxingData)
          }
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [clientSlug])

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Inboxing Report</h1>
          <p className="text-muted-foreground">Email placement and deliverability analysis</p>
        </div>

        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Overall Deliverability</CardTitle>
            <CardDescription>Inbox vs spam rate across all tracked emails (last 30 days)</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[280px] flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : inboxingData.length > 0 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 30, right: 30, bottom: 30, left: 30 }}>
                      <Pie
                        data={inboxingData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={48}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}%`}
                        labelLine={true}
                      >
                        {inboxingData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={INBOX_COLORS[index % INBOX_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [`${value}%`]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  {inboxingData.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: INBOX_COLORS[i] }}
                      />
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No placement data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
