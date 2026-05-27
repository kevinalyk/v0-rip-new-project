import { Suspense } from "react"
import { CIPricingContent } from "@/components/ci-pricing-content"
import { Loader2 } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export const metadata = {
  title: "Plans & Pricing — Inbox.GOP",
  description: "Compare plans and get started with Inbox.GOP political intelligence.",
}

export default function PublicBillingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Minimal header for public context */}
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative w-8 h-8">
              <Image
                src="/images/IconOnly_Transparent_NoBuffer.png"
                alt="Inbox.GOP"
                fill
                style={{ objectFit: "contain" }}
                priority
              />
            </div>
            <span className="font-bold text-base">Inbox.GOP</span>
          </Link>
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main>
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <CIPricingContent />
        </Suspense>
      </main>
    </div>
  )
}
