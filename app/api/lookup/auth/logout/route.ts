import { NextResponse } from "next/server"
import { LOOKUP_COOKIE } from "@/lib/lookup-auth"

export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.set({
    name: LOOKUP_COOKIE,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
  })
  return response
}
