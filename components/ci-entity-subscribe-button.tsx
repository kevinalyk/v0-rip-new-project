"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Star } from "lucide-react"
import { toast } from "sonner"
import { useParams } from "next/navigation"

interface CiEntitySubscribeButtonProps {
  entityId: string
  entityName: string
  initialSubscribed?: boolean
  onSubscriptionChange?: (subscribed: boolean) => void
}

export function CiEntitySubscribeButton({
  entityId,
  entityName,
  initialSubscribed = false,
  onSubscriptionChange,
}: CiEntitySubscribeButtonProps) {
  const [subscribed, setSubscribed] = useState(initialSubscribed)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const params = useParams()
  const clientSlug = params.clientSlug as string

  useEffect(() => {
    const checkSubscriptionStatus = async () => {
      try {
        setChecking(true)
        const response = await fetch(`/api/ci/subscriptions/check?entityId=${entityId}`, {
          credentials: "include",
        })

        if (response.ok) {
          const data = await response.json()
          setSubscribed(data.subscribed)
        }
      } catch (error) {
        console.error("Error checking subscription status:", error)
      } finally {
        setChecking(false)
      }
    }

    checkSubscriptionStatus()
  }, [entityId])

  const handleToggle = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/ci/subscriptions/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId }),
        credentials: "include",
      })

      if (response.status === 403) {
        const data = await response.json()
        toast.error(data.message || "Follow limit reached", {
          description: "Upgrade your plan to follow more entities",
          action: {
            label: "Upgrade",
            onClick: () => {
              window.location.href = `/${clientSlug}/billing`
            },
          },
        })
        return
      }

      if (!response.ok) {
        throw new Error("Failed to toggle subscription")
      }

      const data = await response.json()
      setSubscribed(data.subscribed)
      onSubscriptionChange?.(data.subscribed)

      toast.success(data.subscribed ? `Following ${entityName}` : `Unfollowed ${entityName}`)
    } catch (error) {
      console.error("Error toggling subscription:", error)
      toast.error("Failed to update subscription")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant={subscribed ? "default" : "outline"}
      size="sm"
      onClick={handleToggle}
      disabled={loading || checking}
      className="gap-2"
    >
      <Star size={16} className={subscribed ? "fill-current" : ""} />
      {checking ? "..." : subscribed ? "Following" : "Follow"}
    </Button>
  )
}
