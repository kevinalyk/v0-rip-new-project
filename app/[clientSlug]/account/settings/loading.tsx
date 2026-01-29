import { Loader2 } from "lucide-react"

export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Loader2 size={32} className="animate-spin mx-auto mb-4 text-rip-red" />
        <p>Loading settings...</p>
      </div>
    </div>
  )
}
