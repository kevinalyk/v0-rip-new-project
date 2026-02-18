import Image from "next/image"
import { cn } from "@/lib/utils"

interface LogoProps {
  collapsed?: boolean
  variant?: "full" | "icon"
  className?: string
}

export function Logo({ collapsed = false, variant = "full", className }: LogoProps) {
  const logoSrc = "/images/IconOnly_Transparent_NoBuffer.png"

  return (
    <div className={cn("flex items-center", className)}>
      <div className="relative overflow-hidden">
        <Image
          src={logoSrc || "/placeholder.svg"}
          alt="RIP Logo"
          width={collapsed ? 40 : 40}
          height={collapsed ? 40 : 40}
          className="object-contain"
          priority
          onError={(e) => {
            // Fallback if image fails to load
            const target = e.target as HTMLImageElement
            target.onerror = null
            target.style.backgroundColor = "#1e293b"
            target.style.borderRadius = "4px"
          }}
        />
      </div>
    </div>
  )
}
