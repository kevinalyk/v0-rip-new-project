import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"
import * as Imap from "node-imap"
import { simpleParser } from "mailparser"
import { getServerSettings } from "@/lib/email-connection"
import { fetchOutlookEmails, shouldUseGraphAPI } from "@/lib/microsoft-graph"

// The 3 internal RIP test seed inboxes used to check how WinRed-related mail lands.
// This is unrelated to the actual WinRed platform.
export const WINRED_TEST_EMAILS = [
  "redjohnson2025@outlook.com",
  "HudsonPopcorn@outlook.com",
  "marcus.ellery.ridge62@gmail.com",
]

const LOOKBACK_DAYS = 2
const MAX_EMAILS_PER_SEED = 100

interface ScannedEmail {
  subject: string
  from: { name: string; address: string }
  date: Date
  messageId?: string
  placement: "inbox" | "spam"
  preview?: string
}

function formatDateForImap(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${date.getDate()}-${months[date.getMonth()]}-${date.getFullYear()}`
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Fetches inbox + spam messages for a Gmail (or other IMAP) seed since startDate.
async function fetchImapEmails(seedEmail: any, startDate: Date, maxEmails: number): Promise<ScannedEmail[]> {
  return new Promise((resolve) => {
    try {
      const password =
        seedEmail.twoFactorEnabled && seedEmail.appPassword ? decrypt(seedEmail.appPassword) : decrypt(seedEmail.password)

      const serverSettings = getServerSettings(seedEmail.provider)
      if (!serverSettings?.imap) {
        resolve([])
        return
      }

      const imap = new Imap({
        user: seedEmail.email,
        password,
        host: serverSettings.imap.host,
        port: serverSettings.imap.port,
        tls: serverSettings.imap.tls,
        tlsOptions: { rejectUnauthorized: false, servername: serverSettings.imap.host },
        authTimeout: 20000,
        connTimeout: 20000,
      })

      const emails: ScannedEmail[] = []
      let resolved = false

      const finish = () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          try {
            imap.end()
          } catch {}
          resolve(emails)
        }
      }

      const timeout = setTimeout(finish, 60000)

      imap.once("error", (err: Error) => {
        console.error(`[winred-inbox] IMAP error for ${seedEmail.email}:`, err.message)
        finish()
      })

      function fetchFolder(folderName: string, placement: "inbox" | "spam", onDone: () => void) {
        imap.openBox(folderName, true, (err) => {
          if (err) {
            onDone()
            return
          }

          imap.search([["SINCE", formatDateForImap(startDate)]], (err, results) => {
            if (err || !results || results.length === 0) {
              onDone()
              return
            }

            const limited = results.slice(-Math.min(results.length, maxEmails))
            const fetch = imap.fetch(limited, { bodies: [""], struct: true })
            let processed = 0
            const expected = limited.length

            fetch.on("message", (msg) => {
              msg.on("body", (stream) => {
                let buffer = ""
                stream.on("data", (chunk) => {
                  buffer += chunk.toString("utf8")
                })
                stream.once("end", () => {
                  simpleParser(buffer, {}, (err, parsed) => {
                    if (!err && parsed) {
                      const bodyText = parsed.text || (parsed.html ? stripHtml(parsed.html as string) : "")
                      emails.push({
                        subject: parsed.subject || "",
                        from: parsed.from?.value[0] || { name: "", address: "" },
                        date: parsed.date || new Date(),
                        messageId: parsed.messageId,
                        placement,
                        preview: bodyText.slice(0, 500),
                      })
                    }
                    processed++
                    if (processed === expected) onDone()
                  })
                })
              })
            })

            fetch.once("error", () => onDone())
          })
        })
      }

      imap.once("ready", () => {
        const spamFolder = seedEmail.provider === "gmail" ? "[Gmail]/Spam" : "Spam"
        fetchFolder("INBOX", "inbox", () => {
          fetchFolder(spamFolder, "spam", finish)
        })
      })

      imap.connect()
    } catch (error) {
      console.error(`[winred-inbox] Error fetching IMAP emails for ${seedEmail?.email}:`, error)
      resolve([])
    }
  })
}

interface ScanResult {
  seedEmail: string
  scanned: number
  saved: number
  error?: string
}

// Scans the 3 WinRed testing seed inboxes for new mail and persists it. Safe to call
// repeatedly — messages are deduped on (seedEmailId, messageId).
export async function scanWinRedInboxes(): Promise<{ results: ScanResult[]; totalSaved: number }> {
  const seedEmails = await prisma.seedEmail.findMany({
    where: {
      email: { in: WINRED_TEST_EMAILS },
      active: true,
    },
  })

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - LOOKBACK_DAYS)

  const results: ScanResult[] = []
  let totalSaved = 0

  for (const seedEmail of seedEmails) {
    try {
      let scanned: ScannedEmail[] = []

      if (shouldUseGraphAPI(seedEmail.provider)) {
        const graphEmails = await fetchOutlookEmails(seedEmail, startDate, MAX_EMAILS_PER_SEED)
        scanned = graphEmails.map((e) => ({
          subject: e.subject,
          from: e.from,
          date: e.date,
          messageId: e.messageId,
          placement: e.placement as "inbox" | "spam",
          preview: e.emailContent ? stripHtml(e.emailContent).slice(0, 500) : undefined,
        }))
      } else {
        scanned = await fetchImapEmails(seedEmail, startDate, MAX_EMAILS_PER_SEED)
      }

      let saved = 0
      for (const email of scanned) {
        try {
          await prisma.winRedInboxMessage.upsert({
            where: {
              seedEmailId_messageId: {
                seedEmailId: seedEmail.id,
                messageId: email.messageId || `no-id:${email.subject}:${email.date.toISOString()}`,
              },
            },
            update: {},
            create: {
              seedEmailId: seedEmail.id,
              seedEmailAddress: seedEmail.email,
              messageId: email.messageId || `no-id:${email.subject}:${email.date.toISOString()}`,
              subject: email.subject,
              senderName: email.from?.name || null,
              senderEmail: email.from?.address || null,
              placement: email.placement,
              preview: email.preview || null,
              receivedAt: email.date,
            },
          })
          saved++
        } catch (err) {
          console.error(`[winred-inbox] Failed to save message for ${seedEmail.email}:`, err)
        }
      }

      totalSaved += saved
      results.push({ seedEmail: seedEmail.email, scanned: scanned.length, saved })
    } catch (error: any) {
      console.error(`[winred-inbox] Error scanning ${seedEmail.email}:`, error)
      results.push({ seedEmail: seedEmail.email, scanned: 0, saved: 0, error: error?.message || "Unknown error" })
    }
  }

  return { results, totalSaved }
}
