import { type NextRequest, NextResponse } from "next/server"
import { getLookupSessionFromRequest } from "@/lib/lookup-auth"

export async function GET(request: NextRequest) {
  const session = await getLookupSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 })
  }
  return NextResponse.json({ user: { id: session.userId, email: session.email } })
}
