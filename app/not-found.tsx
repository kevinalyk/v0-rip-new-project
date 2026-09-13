import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16 text-center">
      <Image
        src="/images/IconOnly_Transparent_NoBuffer.png"
        alt=""
        width={56}
        height={56}
        className="mb-8 opacity-90"
      />
      <p className="text-sm font-semibold tracking-widest text-rip-red mb-3">404</p>
      <h1 className="text-3xl font-bold tracking-tight mb-4 text-balance">Page not found</h1>
      <p className="text-muted-foreground leading-relaxed max-w-md mb-8 text-pretty">
        The page you&apos;re looking for doesn&apos;t exist or may have moved. Check the URL, or head back to a page
        that does.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild variant="branded">
          <Link href="/">Go to homepage</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/directory">Browse directory</Link>
        </Button>
      </div>
    </main>
  )
}
