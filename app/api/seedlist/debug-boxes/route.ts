import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { decrypt } from "@/lib/encryption"
import prisma from "@/lib/prisma"
import * as Imap from "node-imap"

// Get server settings based on provider
function getServerSettings(provider: string) {
  const settings: Record<string, any> = {
    gmail: {
      imap: {
        host: "imap.gmail.com",
        port: 993,
        tls: true,
      },
    },
    yahoo: {
      imap: {
        host: "imap.mail.yahoo.com",
        port: 993,
        tls: true,
      },
    },
    outlook: {
      imap: {
        host: "imap-mail.outlook.com",
        port: 993,
        tls: true,
      },
    },
    hotmail: {
      imap: {
        host: "imap-mail.outlook.com",
        port: 993,
        tls: true,
      },
    },
    aol: {
      imap: {
        host: "imap.aol.com",
        port: 993,
        tls: true,
      },
    },
    icloud: {
      imap: {
        host: "imap.mail.me.com",
        port: 993,
        tls: true,
      },
    },
  }

  return settings[provider.toLowerCase()] || settings.gmail
}

async function getEmailBoxes(email: string, password: string, provider: string) {
  console.log(`🔍 === GETTING EMAIL BOXES FOR ${email} ===`)
  console.log(`📧 Email: ${email}`)
  console.log(`🏢 Provider: ${provider}`)
  console.log(`🔑 Password length: ${password.length}`)

  return new Promise((resolve) => {
    try {
      const serverSettings = getServerSettings(provider)

      if (!serverSettings || !serverSettings.imap) {
        console.log("❌ No IMAP settings found for provider:", provider)
        return resolve({
          success: false,
          error: `No IMAP settings found for provider: ${provider}`,
        })
      }

      console.log(`🌐 Server settings:`, {
        host: serverSettings.imap.host,
        port: serverSettings.imap.port,
        tls: serverSettings.imap.tls,
      })

      const imapConfig: any = {
        user: email,
        password: password,
        host: serverSettings.imap.host,
        port: serverSettings.imap.port,
        tls: serverSettings.imap.tls,
        tlsOptions: {
          rejectUnauthorized: false,
          servername: serverSettings.imap.host,
          secureProtocol: "TLSv1_2_method",
        },
        authTimeout: 30000,
        connTimeout: 30000,
        debug: (info: string) => {
          console.log("📡 IMAP DEBUG:", info)
        },
      }

      // Special handling for different providers
      if (provider.toLowerCase() === "outlook" || provider.toLowerCase() === "hotmail") {
        console.log("🔵 Applying Outlook-specific IMAP configuration...")
        imapConfig.authTimeout = 45000
        imapConfig.connTimeout = 45000
        imapConfig.keepalive = {
          interval: 10000,
          idleInterval: 300000,
          forceNoop: true,
        }
      }

      console.log("🔧 Final IMAP configuration:", {
        user: imapConfig.user,
        host: imapConfig.host,
        port: imapConfig.port,
        tls: imapConfig.tls,
        authTimeout: imapConfig.authTimeout,
        connTimeout: imapConfig.connTimeout,
      })

      const imap = new Imap(imapConfig)

      console.log("✅ IMAP client created")

      let resolved = false
      let connectionStage = "initializing"

      const cleanup = () => {
        if (!resolved) {
          resolved = true
          console.log(`🧹 Cleaning up connection (stage: ${connectionStage})`)
          try {
            imap.end()
          } catch (e) {
            console.log("⚠️ Cleanup error:", e)
          }
        }
      }

      // Connection error handler
      imap.once("error", (err: any) => {
        console.log("❌ === IMAP CONNECTION ERROR ===")
        console.log("❌ Connection stage:", connectionStage)
        console.log("❌ Error message:", err.message)
        console.log("❌ Error code:", err?.code)

        cleanup()
        resolve({
          success: false,
          error: err.message || "Unknown IMAP error occurred",
          debugInfo: {
            host: serverSettings.imap.host,
            port: serverSettings.imap.port,
            provider: provider,
            connectionStage: connectionStage,
            errorCode: err?.code,
            errorType: err?.constructor?.name,
          },
        })
      })

      // Connection success handler
      imap.once("ready", () => {
        connectionStage = "authenticated"
        console.log("🎉 === IMAP CONNECTION SUCCESSFUL ===")
        console.log("🎉 Connection established and authenticated!")

        // Get list of all boxes/folders
        connectionStage = "getting_boxes"
        console.log("📂 Getting list of all boxes/folders...")

        imap.getBoxes((err, boxes) => {
          if (err) {
            console.log("❌ Failed to get boxes:", err)
            cleanup()
            resolve({
              success: false,
              error: `Failed to get boxes: ${err.message}`,
              debugInfo: {
                host: serverSettings.imap.host,
                port: serverSettings.imap.port,
                provider: provider,
                stage: "get_boxes_error",
                connectionStage: connectionStage,
              },
            })
          } else {
            connectionStage = "boxes_retrieved"
            console.log("✅ Boxes retrieved successfully!")
            console.log("📊 Raw boxes data:", JSON.stringify(boxes, null, 2))

            // Parse the boxes into a flat list
            const boxList = parseBoxes(boxes)
            console.log("📋 Parsed boxes:", boxList)

            cleanup()
            resolve({
              success: true,
              boxes: boxList,
              debugInfo: {
                host: serverSettings.imap.host,
                port: serverSettings.imap.port,
                provider: provider,
                totalBoxes: boxList.length,
                rawBoxes: boxes,
              },
            })
          }
        })
      })

      // Set timeout
      const timeoutMs = provider.toLowerCase() === "outlook" || provider.toLowerCase() === "hotmail" ? 45000 : 30000
      setTimeout(() => {
        if (!resolved) {
          console.log(`⏰ Connection timeout after ${timeoutMs / 1000} seconds (stage: ${connectionStage})`)
          cleanup()
          resolve({
            success: false,
            error: `Connection timeout after ${timeoutMs / 1000} seconds`,
            debugInfo: {
              host: serverSettings.imap.host,
              port: serverSettings.imap.port,
              provider: provider,
              stage: "timeout",
              connectionStage: connectionStage,
            },
          })
        }
      }, timeoutMs)

      // Start the connection
      connectionStage = "connecting"
      console.log("⏳ Initiating IMAP connection...")
      imap.connect()
    } catch (error) {
      console.log("💥 Exception in getEmailBoxes:", error)
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        debugInfo: {
          provider: provider,
          stage: "setup_exception",
          exceptionType: error?.constructor?.name,
        },
      })
    }
  })
}

// Helper function to parse nested boxes structure into flat list
function parseBoxes(boxes: any, prefix = ""): any[] {
  const result: any[] = []

  for (const [name, box] of Object.entries(boxes)) {
    const fullName = prefix ? `${prefix}${box.delimiter || "/"}${name}` : name

    result.push({
      name: fullName,
      displayName: name,
      delimiter: box.delimiter,
      attribs: box.attribs,
      readonly: box.attribs?.includes("\\Noselect") || false,
      special: getSpecialFolderType(box.attribs),
      messages: box.messages?.total,
    })

    // Recursively parse children
    if (box.children && Object.keys(box.children).length > 0) {
      result.push(...parseBoxes(box.children, fullName))
    }
  }

  return result
}

// Helper function to identify special folder types
function getSpecialFolderType(attribs: string[]): string | null {
  if (!attribs) return null

  if (attribs.includes("\\Inbox")) return "Inbox"
  if (attribs.includes("\\Sent")) return "Sent"
  if (attribs.includes("\\Drafts")) return "Drafts"
  if (attribs.includes("\\Trash")) return "Trash"
  if (attribs.includes("\\Junk")) return "Spam/Junk"
  if (attribs.includes("\\Spam")) return "Spam/Junk"
  if (attribs.includes("\\All")) return "All Mail"
  if (attribs.includes("\\Archive")) return "Archive"
  if (attribs.includes("\\Flagged")) return "Flagged"

  return null
}

export async function POST(request: Request) {
  try {
    console.log("🔍 === DEBUG BOXES API ENDPOINT ===")

    // Check if user is authenticated
    const isAuth = await isAuthenticated(request)
    if (!isAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get the request body
    const { id, email, provider } = await request.json()
    console.log(`📧 Email: ${email}`)
    console.log(`🏢 Provider: ${provider}`)

    if (!id || !email || !provider) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    // Get the seed email from the database
    const seedEmail = await prisma.seedEmail.findUnique({
      where: { id },
    })

    if (!seedEmail) {
      return NextResponse.json({ error: "Seed email not found" }, { status: 404 })
    }

    // Decrypt the password
    const password =
      seedEmail.twoFactorEnabled && seedEmail.appPassword ? decrypt(seedEmail.appPassword) : decrypt(seedEmail.password)

    console.log(`🔑 Password length: ${password.length}`)
    console.log(`🔐 Using 2FA: ${seedEmail.twoFactorEnabled}`)
    console.log(`🔐 Has app password: ${!!seedEmail.appPassword}`)

    // Get the email boxes
    console.log("📋 Starting email boxes retrieval...")
    const result = await getEmailBoxes(email, password, provider)

    console.log("🏁 === DEBUG BOXES COMPLETED ===")
    console.log(`✅ Boxes retrieval successful: ${result.success}`)

    if (result.success) {
      console.log("🎉 Boxes retrieved successfully!")
      console.log(`📊 Found ${result.boxes?.length || 0} boxes`)
    } else {
      console.log(`❌ Boxes retrieval failed: ${result.error}`)
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("💥 Error in debug boxes:", error)
    return NextResponse.json(
      { error: "Failed to debug boxes", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
