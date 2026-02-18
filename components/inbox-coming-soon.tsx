"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Wrench, Mail, BarChart3, Calendar } from "lucide-react"

export function InboxComingSoon() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-8 py-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-rip-red/10 rounded-full mb-4">
            <Wrench size={40} className="text-rip-red" />
          </div>
          <h1 className="text-4xl font-bold">Inbox Tools Coming Soon</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            We're working hard to bring you powerful inbox monitoring and campaign management tools. Stay tuned!
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <Mail size={24} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold">Campaign Monitoring</h3>
              <p className="text-sm text-muted-foreground">
                Track email campaigns and monitor inbox placement rates across providers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <BarChart3 size={24} className="text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-semibold">Advanced Reporting</h3>
              <p className="text-sm text-muted-foreground">
                Get detailed analytics on delivery rates, spam placement, and engagement metrics
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <Calendar size={24} className="text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="font-semibold">Seed List Management</h3>
              <p className="text-sm text-muted-foreground">
                Manage seed email accounts and automate inbox placement testing
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Status Message */}
        <div className="text-center pt-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 rounded-full text-sm font-medium">
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
            In Development
          </div>
        </div>
      </div>
    </div>
  )
}
