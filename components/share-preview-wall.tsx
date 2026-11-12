import Link from "next/link"
import { Calendar, Lock, Mail, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DEFAULT_TRIAL_DAYS } from "@/lib/checkout-disclosures"

export interface SharePreviewCampaign {
  id: string
  type: "email" | "sms"
  senderName: string
  subject: string
  dateReceived: string
  entity?: { name: string } | null
}

interface SharePreviewWallProps {
  campaign: SharePreviewCampaign
  token: string
}

const PLACEHOLDER_LINE_WIDTHS = ["w-3/4", "w-full", "w-5/6", "w-full", "w-2/3", "w-full", "w-4/5", "w-1/2"]

export function SharePreviewWall({ campaign, token }: SharePreviewWallProps) {
  const signupHref = `/signup?source=share_link&campaign=${encodeURIComponent(campaign.id)}`
  const loginHref = `/login?redirect=/share/${token}`
  const SenderIcon = campaign.type === "sms" ? Smartphone : Mail

  return (
    <main className="min-h-screen bg-background flex items-start justify-center py-6 px-4 md:items-center">
      <div className="w-full max-w-2xl space-y-4">
        <div className="rounded-lg border bg-card shadow-sm p-4 md:p-6">
          <h1 className="text-base md:text-xl font-semibold break-words">{campaign.subject}</h1>
          <div className="mt-3 flex flex-col gap-1.5 text-sm">
            {campaign.entity?.name && <span className="font-semibold break-words">{campaign.entity.name}</span>}
            <div className="flex items-start gap-2 min-w-0">
              <SenderIcon className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="font-medium break-words">{campaign.senderName}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <time dateTime={campaign.dateReceived}>{new Date(campaign.dateReceived).toLocaleDateString()}</time>
            </div>
          </div>

          <div className="relative mt-5 overflow-hidden rounded-lg border bg-white">
            {/* Placeholder shapes only: the real body never reaches the browser, so there is nothing to un-blur. */}
            <div aria-hidden="true" className="select-none pointer-events-none blur-md p-5 md:p-6 space-y-3">
              <div className="h-8 w-1/3 rounded bg-neutral-300" />
              <div className="h-24 w-full rounded bg-neutral-200" />
              {PLACEHOLDER_LINE_WIDTHS.map((width, index) => (
                <div key={index} className={`h-3 rounded bg-neutral-300 ${width}`} />
              ))}
              <div className="h-10 w-40 rounded bg-neutral-400" />
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/30 text-center px-4">
              <Lock className="h-6 w-6 text-neutral-700" aria-hidden="true" />
              <p className="text-sm font-medium text-neutral-800">The full campaign is available to members</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 text-center">
          <Button asChild size="lg" className="w-full whitespace-normal h-auto py-3">
            <Link href={signupHref}>See the full campaign: start your free {DEFAULT_TRIAL_DAYS}-day trial</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href={loginHref} className="font-medium text-foreground underline underline-offset-4">
              Sign in
            </Link>
          </p>
          <p className="pt-2 text-xs text-muted-foreground">Powered by Inbox.GOP</p>
        </div>
      </div>
    </main>
  )
}
