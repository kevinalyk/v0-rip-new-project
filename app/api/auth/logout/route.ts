import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function POST() {
  // Clear the auth cookie
  cookies().set({
    name: "auth_token",
    value: "",
    expires: new Date(0),
    path: "/",
    domain: ".rip-tool.com", // Must match the domain used when setting the cookie
  })

  return NextResponse.json({ success: true })
}
