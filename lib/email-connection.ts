import * as Imap from "node-imap"
import { decrypt } from "./encryption"

// Email server configurations
const EMAIL_SERVERS = {
  gmail: {
    imap: {
      host: "imap.gmail.com",
      port: 993,
      tls: true,
    },
    smtp: {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
    },
  },
  yahoo: {
    imap: {
      host: "imap.mail.yahoo.com",
      port: 993,
      tls: true,
    },
    smtp: {
      host: "smtp.mail.yahoo.com",
      port: 587,
      secure: false,
    },
  },
  outlook: {
    imap: {
      host: "outlook.office365.com",
      port: 993,
      tls: true,
    },
    smtp: {
      host: "smtp-mail.outlook.com",
      port: 587,
      secure: false,
    },
  },
  hotmail: {
    imap: {
      host: "outlook.office365.com",
      port: 993,
      tls: true,
    },
    smtp: {
      host: "smtp-mail.outlook.com",
      port: 587,
      secure: false,
    },
  },
  aol: {
    imap: {
      host: "imap.aol.com",
      port: 993,
      tls: true,
    },
    smtp: {
      host: "smtp.aol.com",
      port: 587,
      secure: false,
    },
  },
  icloud: {
    imap: {
      host: "imap.mail.me.com",
      port: 993,
      tls: true,
    },
    smtp: {
      host: "smtp.mail.me.com",
      port: 587,
      secure: false,
    },
  },
}

export function getServerSettings(provider: string) {
  const normalizedProvider = provider.toLowerCase()
  return EMAIL_SERVERS[normalizedProvider as keyof typeof EMAIL_SERVERS] || null
}

export function determineProvider(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase()

  if (!domain) return "unknown"

  if (domain.includes("gmail")) return "gmail"
  if (domain.includes("yahoo")) return "yahoo"
  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live")) return "outlook"
  if (domain.includes("aol")) return "aol"
  if (domain.includes("icloud") || domain.includes("me.com") || domain.includes("mac.com")) return "icloud"

  return "other"
}

// Main IMAP connection test function that's used throughout the app
export async function testImapConnection(
  email: string,
  password: string,
  provider: string,
): Promise<{
  success: boolean
  message?: string
  error?: string
  details?: any
}> {
  console.log(`🔍 Testing IMAP connection for ${email} (${provider})`)

  return new Promise((resolve) => {
    try {
      const serverSettings = getServerSettings(provider)

      if (!serverSettings?.imap) {
        console.log(`❌ No IMAP settings found for provider: ${provider}`)
        resolve({
          success: false,
          error: `No IMAP settings found for provider: ${provider}`,
        })
        return
      }

      console.log(`🌐 Connecting to ${serverSettings.imap.host}:${serverSettings.imap.port}`)

      const imap = new Imap({
        user: email,
        password: password,
        host: serverSettings.imap.host,
        port: serverSettings.imap.port,
        tls: serverSettings.imap.tls,
        tlsOptions: {
          rejectUnauthorized: false,
          servername: serverSettings.imap.host,
        },
        authTimeout: 15000,
        connTimeout: 15000,
        debug: (info: string) => {
          console.log(`📡 IMAP DEBUG [${email}]:`, info)
        },
      })

      let resolved = false

      const cleanup = () => {
        if (!resolved) {
          resolved = true
          try {
            imap.end()
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      }

      // Set timeout
      const timeout = setTimeout(() => {
        if (!resolved) {
          console.log(`⏰ Connection timeout for ${email}`)
          cleanup()
          resolve({
            success: false,
            error: "Connection timeout after 15 seconds",
            details: {
              host: serverSettings.imap.host,
              port: serverSettings.imap.port,
              provider: provider,
            },
          })
        }
      }, 15000)

      imap.once("error", (err) => {
        console.log(`❌ IMAP error for ${email}:`, err.message)
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          cleanup()
          resolve({
            success: false,
            error: err.message,
            details: {
              host: serverSettings.imap.host,
              port: serverSettings.imap.port,
              provider: provider,
              errorCode: err.code,
              errorType: err.constructor?.name,
            },
          })
        }
      })

      imap.once("ready", () => {
        console.log(`✅ IMAP connected for ${email}`)

        // Try to open INBOX to verify full access
        imap.openBox("INBOX", true, (err, box) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)

            if (err) {
              console.log(`❌ Failed to open INBOX for ${email}:`, err.message)
              cleanup()
              resolve({
                success: false,
                error: `Connected but failed to open INBOX: ${err.message}`,
                details: {
                  host: serverSettings.imap.host,
                  port: serverSettings.imap.port,
                  provider: provider,
                },
              })
            } else {
              console.log(`✅ INBOX opened successfully for ${email}`)
              cleanup()
              resolve({
                success: true,
                message: "Successfully connected to IMAP server and opened INBOX",
                details: {
                  host: serverSettings.imap.host,
                  port: serverSettings.imap.port,
                  provider: provider,
                  mailboxInfo: {
                    name: box.name,
                    messages: box.messages.total,
                    recent: box.messages.recent,
                    unseen: box.messages.unseen,
                  },
                },
              })
            }
          }
        })
      })

      console.log(`⏳ Starting IMAP connection for ${email}`)
      imap.connect()
    } catch (error) {
      console.log(`💥 Exception in testImapConnection for ${email}:`, error)
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        details: {
          provider: provider,
          exceptionType: error?.constructor?.name,
        },
      })
    }
  })
}

export async function testEmailConnection(seedEmail: any): Promise<{
  success: boolean
  error?: string
  details?: any
}> {
  try {
    // Decrypt password
    const password =
      seedEmail.twoFactorEnabled && seedEmail.appPassword ? decrypt(seedEmail.appPassword) : decrypt(seedEmail.password)

    // Use the main testImapConnection function
    const result = await testImapConnection(seedEmail.email, password, seedEmail.provider)

    return {
      success: result.success,
      error: result.error,
      details: result.details,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function debugEmailConnection(seedEmail: any): Promise<{
  success?: boolean
  error?: string
  steps?: Array<{
    step: string
    success: boolean
    details?: any
    error?: string
  }>
}> {
  const steps: Array<{
    step: string
    success: boolean
    details?: any
    error?: string
  }> = []

  try {
    // Step 1: Check provider settings
    steps.push({
      step: "Checking provider settings",
      success: true,
      details: {
        provider: seedEmail.provider,
        email: seedEmail.email,
      },
    })

    // Step 2: Get server settings
    const serverSettings = getServerSettings(seedEmail.provider)
    if (!serverSettings?.imap) {
      steps.push({
        step: "Getting server settings",
        success: false,
        error: `No IMAP settings found for provider: ${seedEmail.provider}`,
      })
      return { steps }
    }

    steps.push({
      step: "Getting server settings",
      success: true,
      details: serverSettings.imap,
    })

    // Step 3: Decrypt password
    let password: string
    try {
      password =
        seedEmail.twoFactorEnabled && seedEmail.appPassword
          ? decrypt(seedEmail.appPassword)
          : decrypt(seedEmail.password)

      steps.push({
        step: "Decrypting password",
        success: true,
        details: {
          passwordLength: password.length,
          usingAppPassword: seedEmail.twoFactorEnabled && seedEmail.appPassword,
        },
      })
    } catch (error) {
      steps.push({
        step: "Decrypting password",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
      return { steps }
    }

    // Step 4: Test connection using the main function
    const connectionResult = await testImapConnection(seedEmail.email, password, seedEmail.provider)

    steps.push({
      step: "Testing IMAP connection",
      success: connectionResult.success,
      error: connectionResult.error,
      details: connectionResult.details,
    })

    return { steps }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function getEmailBoxes(seedEmail: any): Promise<{
  success?: boolean
  error?: string
  boxes?: Array<{
    name: string
    displayName?: string
    messages?: number
    readonly?: boolean
    special?: string
  }>
  debugInfo?: any
}> {
  return new Promise((resolve) => {
    try {
      // Decrypt password
      const password =
        seedEmail.twoFactorEnabled && seedEmail.appPassword
          ? decrypt(seedEmail.appPassword)
          : decrypt(seedEmail.password)

      // Get server settings
      const serverSettings = getServerSettings(seedEmail.provider)
      if (!serverSettings?.imap) {
        resolve({
          success: false,
          error: `No IMAP settings found for provider: ${seedEmail.provider}`,
        })
        return
      }

      // Create IMAP connection
      const imap = new Imap({
        user: seedEmail.email,
        password: password,
        host: serverSettings.imap.host,
        port: serverSettings.imap.port,
        tls: serverSettings.imap.tls,
        tlsOptions: {
          rejectUnauthorized: false,
          servername: serverSettings.imap.host,
        },
        authTimeout: 15000,
        connTimeout: 15000,
      })

      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          try {
            imap.end()
          } catch (e) {}
          resolve({
            success: false,
            error: "Connection timeout after 15 seconds",
          })
        }
      }, 15000)

      imap.once("error", (err) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve({
            success: false,
            error: err.message,
          })
        }
      })

      imap.once("ready", () => {
        imap.getBoxes((err, boxes) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)

            if (err) {
              imap.end()
              resolve({
                success: false,
                error: err.message,
              })
              return
            }

            // Parse boxes into a flat array
            const parseBoxes = (boxObj: any, prefix = ""): any[] => {
              const result: any[] = []

              for (const [name, box] of Object.entries(boxObj)) {
                const fullName = prefix ? `${prefix}${box.delimiter || "/"}${name}` : name
                const boxInfo: any = {
                  name: fullName,
                  displayName: name,
                  messages: box.messages?.total,
                  readonly: box.readonly,
                }

                // Check for special folders
                if (box.special_use_flags) {
                  if (box.special_use_flags.includes("\\Sent")) boxInfo.special = "sent"
                  if (box.special_use_flags.includes("\\Drafts")) boxInfo.special = "drafts"
                  if (box.special_use_flags.includes("\\Trash")) boxInfo.special = "trash"
                  if (box.special_use_flags.includes("\\Junk")) boxInfo.special = "spam"
                }

                // Common spam folder detection
                const lowerName = name.toLowerCase()
                if (lowerName.includes("spam") || lowerName.includes("junk") || lowerName.includes("bulk")) {
                  boxInfo.special = "spam"
                }

                result.push(boxInfo)

                // Recursively parse children
                if (box.children && Object.keys(box.children).length > 0) {
                  result.push(...parseBoxes(box.children, fullName))
                }
              }

              return result
            }

            const parsedBoxes = parseBoxes(boxes)

            imap.end()
            resolve({
              success: true,
              boxes: parsedBoxes,
              debugInfo: {
                rawBoxes: boxes,
                totalBoxes: parsedBoxes.length,
              },
            })
          }
        })
      })

      imap.connect()
    } catch (error) {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
