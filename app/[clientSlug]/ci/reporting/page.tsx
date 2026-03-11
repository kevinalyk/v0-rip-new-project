"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect } from "react"

export default function CIReportingRedirect() {
  const params = useParams()
  const router = useRouter()
  const clientSlug = params.clientSlug as string

  useEffect(() => {
    router.replace(`/${clientSlug}/reports/reporting`)
  }, [clientSlug, router])

  return null
}
