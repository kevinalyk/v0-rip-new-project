import { Loader2 } from "lucide-react"

export default function DomainHealthLoading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 size={28} className="animate-spin text-muted-foreground" />
    </div>
  )
}
