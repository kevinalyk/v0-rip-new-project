import Image from "next/image"
import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Image
            src="/images/IconOnly_Transparent_NoBuffer.png"
            alt="RIP Logo"
            width={24}
            height={24}
            className="h-6 w-6"
          />
          <span className="text-sm text-muted-foreground">
            © 2025 Republican Inboxing Protocol. All rights reserved.
          </span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="#" className="text-sm text-muted-foreground hover:text-[#dc2a28] transition-colors">
            Privacy Policy
          </Link>
          <Link href="#" className="text-sm text-muted-foreground hover:text-[#dc2a28] transition-colors">
            Terms and Conditions
          </Link>
          <Link href="#" className="text-sm text-muted-foreground hover:text-[#dc2a28] transition-colors">
            Contact
          </Link>
        </div>
      </div>
    </footer>
  )
}
