"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function DebugPage() {
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [isDiagnosing, setIsDiagnosing] = useState(false)
  const [diagnosticsResult, setDiagnosticsResult] = useState<any>(null)

  const runEngagement = async () => {
    setIsRunning(true)
    setResult(null)

    try {
      const response = await fetch("/api/debug/run-engagement", {
        method: "POST",
      })

      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setIsRunning(false)
    }
  }

  const runOutlookDiagnostics = async () => {
    setIsDiagnosing(true)
    setDiagnosticsResult(null)

    try {
      const response = await fetch("/api/debug/outlook-diagnostics", {
        method: "POST",
      })

      const data = await response.json()
      setDiagnosticsResult(data)
    } catch (error) {
      setDiagnosticsResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setIsDiagnosing(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="space-y-6 w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Debug Tools</CardTitle>
            <CardDescription>Manual testing tools for the engagement system</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={runEngagement} disabled={isRunning} className="w-full" size="lg">
              {isRunning ? "Running Engagement Simulation..." : "Run Engagement Simulation"}
            </Button>

            <Button
              onClick={runOutlookDiagnostics}
              disabled={isDiagnosing}
              className="w-full bg-transparent"
              size="lg"
              variant="outline"
            >
              {isDiagnosing ? "Running Outlook Diagnostics..." : "Test Outlook Permissions (riptest4@outlook.com)"}
            </Button>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle>Engagement Simulation Result</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">{JSON.stringify(result, null, 2)}</pre>
            </CardContent>
          </Card>
        )}

        {diagnosticsResult && (
          <Card>
            <CardHeader>
              <CardTitle>Outlook Diagnostics Result</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(diagnosticsResult, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
