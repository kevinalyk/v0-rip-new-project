import { neon } from "@neondatabase/serverless"
import { getServerSettings } from "./email-connection"
import { shouldUseGraphAPI } from "./microsoft-graph"
import { getValidAccessToken } from "./microsoft-oauth"
import { decrypt } from "./encryption"
import * as Imap from "node-imap"
import { PrismaClient } from "@prisma/client"

const sql = neon(process.env.DATABASE_URL!)
const prisma = new PrismaClient()

interface SeedAccount {
  id: string
  email: string
  personalityType: string
  openRateTarget: number
  readingSchedule: string
  lastEngagementAt: Date | null
  engagementEnabled: boolean
  provider: string
  password: string
  appPassword?: string
  twoFactorEnabled: boolean
}

interface EmailToProcess {
  subject: string
  sender: string
  receivedAt: Date
  messageId: string
  uid?: number
  graphId?: string
}

interface SenderFamiliarity {
  senderEmail: string
  trustScore: number
  engagementCount: number
}

export class EngagementSimulator {
  private readonly PERSONALITY_CONFIGS = {
    heavy_reader: { baseOpenRate: 0.8, timeVariance: 0.3 },
    moderate: { baseOpenRate: 0.5, timeVariance: 0.5 },
    light_reader: { baseOpenRate: 0.25, timeVariance: 0.7 },
    selective: { baseOpenRate: 0.35, timeVariance: 0.4 },
  }

  private readonly SCHEDULE_PATTERNS = {
    business_hours: {
      peakHours: [9, 10, 11, 14, 15, 16],
      offHours: [0, 1, 2, 3, 4, 5, 6, 22, 23],
    },
    night_owl: {
      peakHours: [19, 20, 21, 22, 23, 0],
      offHours: [6, 7, 8, 9, 10, 11],
    },
    early_bird: {
      peakHours: [6, 7, 8, 9, 10],
      offHours: [20, 21, 22, 23, 0, 1],
    },
    flexible: {
      peakHours: [8, 12, 16, 20],
      offHours: [2, 3, 4, 5],
    },
  }

  async initializeAccountPersonalities(): Promise<void> {
    console.log("🎭 Initializing account personalities...")

    // Get accounts that don't have personalities set
    const accounts = await sql`
      SELECT id FROM "SeedEmail" 
      WHERE "personality_type" = 'moderate' 
      AND "open_rate_target" = 50
    `

    console.log(`📊 Assigned personalities to ${accounts.length} accounts`)

    for (const account of accounts) {
      const personality = this.generateRandomPersonality()
      const schedule = this.generateRandomSchedule()
      const openRate = this.generateOpenRateTarget(personality)

      await sql`
        UPDATE "SeedEmail" 
        SET 
          "personality_type" = ${personality},
          "reading_schedule" = ${schedule},
          "open_rate_target" = ${openRate}
        WHERE id = ${account.id}
      `
    }

    console.log(`✅ Initialized personalities for ${accounts.length} accounts`)
  }

  private generateRandomPersonality(): string {
    const personalities = ["heavy_reader", "moderate", "light_reader", "selective"]
    const weights = [0.15, 0.4, 0.3, 0.15] // Most accounts are moderate

    const random = Math.random()
    let cumulative = 0

    for (let i = 0; i < personalities.length; i++) {
      cumulative += weights[i]
      if (random <= cumulative) {
        return personalities[i]
      }
    }

    return "moderate"
  }

  private generateRandomSchedule(): string {
    const schedules = ["business_hours", "night_owl", "early_bird", "flexible"]
    const weights = [0.5, 0.2, 0.2, 0.1]

    const random = Math.random()
    let cumulative = 0

    for (let i = 0; i < schedules.length; i++) {
      cumulative += weights[i]
      if (random <= cumulative) {
        return schedules[i]
      }
    }

    return "business_hours"
  }

  private generateOpenRateTarget(personality: string): number {
    const config = this.PERSONALITY_CONFIGS[personality as keyof typeof this.PERSONALITY_CONFIGS]
    const baseRate = config.baseOpenRate
    const variance = 0.1 // ±10% variance

    const rate = baseRate + (Math.random() - 0.5) * variance * 2
    return Math.round(Math.max(0.1, Math.min(0.95, rate)) * 100)
  }

  async simulateEngagement(): Promise<void> {
    console.log("🚀 Starting engagement simulation...")

    // Get active accounts (randomly select 30-50% to be "active" this hour)
    const allAccounts = await this.getEligibleAccounts()
    const activeCount = Math.floor(allAccounts.length * (0.3 + Math.random() * 0.2))
    const activeAccounts = this.shuffleArray(allAccounts).slice(0, activeCount)

    console.log(`📈 Processing ${activeAccounts.length} accounts (${allAccounts.length} total eligible)`)

    for (let i = 0; i < activeAccounts.length; i++) {
      const account = activeAccounts[i]

      try {
        await this.processAccountEngagement(account)

        // Random delay between accounts (1-10 seconds)
        const delay = 1000 + Math.random() * 9000
        await this.sleep(delay)
      } catch (error) {
        console.error(`❌ Error processing account ${account.email}:`, error)
      }
    }

    console.log("✅ Engagement simulation completed")
  }

  private async getEligibleAccounts(): Promise<SeedAccount[]> {
    console.log("🔍 Fetching eligible accounts...")

    const accounts = await sql`
      SELECT 
        id,
        email,
        provider,
        password,
        "appPassword",
        "twoFactorEnabled",
        "personality_type" as "personalityType",
        "open_rate_target" as "openRateTarget", 
        "reading_schedule" as "readingSchedule",
        "last_engagement_at" as "lastEngagementAt",
        "engagement_enabled" as "engagementEnabled"
      FROM "SeedEmail"
      WHERE "engagement_enabled" = true
      AND email IS NOT NULL
      AND password IS NOT NULL
      AND locked = 'false'
      AND ("assignedToClient" IS NULL OR "assignedToClient" != 'RIP')
    `

    console.log(`📋 Found ${accounts.length} eligible accounts`)

    return accounts.map((account) => ({
      id: account.id,
      email: account.email,
      provider: account.provider,
      password: account.password,
      appPassword: account.appPassword,
      twoFactorEnabled: account.twoFactorEnabled === "true" || account.twoFactorEnabled === true,
      personalityType: account.personalityType || "moderate",
      openRateTarget: account.openRateTarget || 50,
      readingSchedule: account.readingSchedule || "business_hours",
      lastEngagementAt: account.lastEngagementAt ? new Date(account.lastEngagementAt) : null,
      engagementEnabled: account.engagementEnabled,
    }))
  }

  private async processAccountEngagement(account: SeedAccount): Promise<void> {
    // Check if it's a good time for this account to be active
    const isGoodTime = this.isGoodTimeForAccount(account)
    console.log(
      `⏰ Time check for ${account.email}: ${isGoodTime ? "ACTIVE" : "INACTIVE"} (${account.readingSchedule})`,
    )

    if (!isGoodTime) {
      console.log(`😴 Skipping ${account.email} - not active during this time`)
      return
    }

    // Get unread emails for this account
    console.log(`📧 Checking ${account.email}`)
    const emails = await this.getUnreadEmails(account)

    if (emails.length === 0) {
      console.log(`📭 No unread emails for ${account.email}, skipping`)
      return
    }

    console.log(`📬 Found ${emails.length} unread emails`)

    // Log the emails found
    emails.forEach((email, index) => {
      console.log(`  📄 Email ${index + 1}: "${email.subject}" from ${email.sender}`)
    })

    // Get sender familiarity data
    const senderFamiliarity = await this.getSenderFamiliarity(account.id)
    console.log(`🤝 Loaded familiarity data for ${senderFamiliarity.size} senders`)

    // Process each email through engagement decision engine
    const emailsToEngage = []

    for (const email of emails) {
      const shouldEngage = await this.shouldEngageWithEmail(account, email, senderFamiliarity)
      console.log(`🎯 Decision for "${email.subject}": ${shouldEngage ? "ENGAGE" : "SKIP"}`)
      if (shouldEngage) {
        emailsToEngage.push(email)
      }
    }

    // Limit engagement per session (realistic behavior)
    const maxEngagements = Math.min(emailsToEngage.length, 3 + Math.floor(Math.random() * 5))
    const selectedEmails = emailsToEngage.slice(0, maxEngagements)

    console.log(`🎪 Selected ${selectedEmails.length} emails to engage with (from ${emailsToEngage.length} candidates)`)

    // Execute engagements with realistic delays
    for (let i = 0; i < selectedEmails.length; i++) {
      const email = selectedEmails[i]

      console.log(`\n🎬 Engaging with email ${i + 1}/${selectedEmails.length}: "${email.subject}"`)

      try {
        await this.engageWithEmail(account, email)
        await this.logEngagement(account.id, "open", email)
        await this.updateSenderFamiliarity(account.id, email.sender)

        console.log(`✅ Successfully engaged with: "${email.subject}"`)

        // Realistic delay between opening emails (2-30 seconds)
        if (i < selectedEmails.length - 1) {
          const delay = 2000 + Math.random() * 28000
          console.log(`⏱️ Waiting ${Math.round(delay / 1000)}s before next email...`)
          await this.sleep(delay)
        }
      } catch (error) {
        console.error(`❌ Failed to engage with email "${email.subject}":`, error)
        await this.logEngagement(account.id, "open", email, false, error.message)
      }
    }

    // Update last engagement time
    await sql`
      UPDATE "SeedEmail" 
      SET "last_engagement_at" = CURRENT_TIMESTAMP 
      WHERE id = ${account.id}
    `

    console.log(`🏁 Completed processing for ${account.email}`)
  }

  private isGoodTimeForAccount(account: SeedAccount): boolean {
    const now = new Date()
    const hour = now.getHours()
    const schedule = this.SCHEDULE_PATTERNS[account.readingSchedule as keyof typeof this.SCHEDULE_PATTERNS]

    if (!schedule) return true

    // Higher probability during peak hours, lower during off hours
    const isPeakHour = schedule.peakHours.includes(hour)
    const isOffHour = schedule.offHours.includes(hour)

    const random = Math.random()

    if (isPeakHour) {
      return random < 0.8 // 80% chance during peak hours
    } else if (isOffHour) {
      return random < 0.1 // 10% chance during off hours
    } else {
      return random < 0.4 // 40% chance during normal hours
    }
  }

  private async getUnreadEmails(account: SeedAccount): Promise<EmailToProcess[]> {
    try {
      console.log(`🔌 Connecting to ${account.provider} for ${account.email}`)

      if (shouldUseGraphAPI(account.provider)) {
        console.log(`📊 Using Graph API for ${account.email}`)
        return await this.getOutlookUnreadEmails(account)
      } else {
        console.log(`📨 Using IMAP for ${account.email}`)
        return await this.getImapUnreadEmails(account)
      }
    } catch (error) {
      console.error(`❌ Error fetching emails for ${account.email}:`, error)
      return []
    }
  }

  private async getOutlookUnreadEmails(account: SeedAccount): Promise<EmailToProcess[]> {
    try {
      console.log(`🔑 Getting access token for ${account.email}`)
      const accessToken = await getValidAccessToken(account.id)
      if (!accessToken) {
        console.log(`❌ No valid access token for ${account.email}`)
        return []
      }

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      const folders = ["inbox", "junkemail"]
      const allEmails: EmailToProcess[] = []

      for (const folder of folders) {
        const url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages?$filter=isRead eq false and receivedDateTime ge ${since.toISOString()}&$select=id,subject,from,receivedDateTime,internetMessageId&$top=20`

        console.log(`🌐 Making Graph API request for ${account.email} in folder ${folder}`)
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        })

        if (!response.ok) {
          console.error(
            `❌ Graph API error for ${account.email} in folder ${folder}: ${response.status} ${response.statusText}`,
          )
          continue
        }

        const data = await response.json()
        const messages = data.value || []

        console.log(`📬 Graph API returned ${messages.length} unread emails for ${account.email} in folder ${folder}`)

        allEmails.push(
          ...messages.map((message: any) => ({
            subject: message.subject || "",
            sender: message.from?.emailAddress?.address || "",
            receivedAt: new Date(message.receivedDateTime),
            messageId: message.internetMessageId || message.id,
            graphId: message.id,
          })),
        )
      }

      return allEmails
    } catch (error) {
      console.error(`❌ Error fetching Outlook emails for ${account.email}:`, error)
      return []
    }
  }

  private async getImapUnreadEmails(account: SeedAccount): Promise<EmailToProcess[]> {
    return new Promise((resolve) => {
      try {
        console.log(`🔐 Decrypting password for ${account.email}`)
        const password =
          account.twoFactorEnabled && account.appPassword ? decrypt(account.appPassword) : decrypt(account.password)

        console.log(`⚙️ Getting server settings for ${account.provider}`)
        const serverSettings = getServerSettings(account.provider)
        if (!serverSettings?.imap) {
          console.log(`❌ No IMAP settings for provider: ${account.provider}`)
          resolve([])
          return
        }

        console.log(`🔗 Connecting to IMAP server: ${serverSettings.imap.host}:${serverSettings.imap.port}`)

        const imap = new Imap({
          user: account.email,
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
            console.log(`⏰ IMAP connection timeout for ${account.email}`)
            try {
              imap.end()
            } catch (e) {}
            resolve([])
          }
        }, 15000)

        imap.once("error", (err) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            console.error(`❌ IMAP error for ${account.email}:`, err.message)
            resolve([])
          }
        })

        imap.once("ready", () => {
          console.log(`✅ IMAP connected for ${account.email}`)
          const foldersToCheck = ["INBOX", "Junk", "Spam", "[Gmail]/Spam"]
          const allEmails: EmailToProcess[] = []
          const foldersChecked = 0

          const checkNextFolder = (folderIndex: number) => {
            if (folderIndex >= foldersToCheck.length) {
              if (!resolved) {
                resolved = true
                clearTimeout(timeout)
                imap.end()
                resolve(allEmails)
              }
              return
            }

            const folderName = foldersToCheck[folderIndex]

            console.log(`📬 Opening folder "${folderName}" for ${account.email}`)
            imap.openBox(folderName, false, (err, box) => {
              if (err) {
                console.log(`❌ Folder "${folderName}" not found or inaccessible for ${account.email}, trying next.`)
                // Folder doesn't exist, try next one
                checkNextFolder(folderIndex + 1)
                return
              }

              console.log(
                `📬 Folder "${folderName}" opened for ${account.email}, total messages: ${box.messages.total}`,
              )

              // Search for unread emails from the last 24 hours
              const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
              console.log(`🔍 Searching for unread emails in "${folderName}" since ${since.toISOString()}`)

              imap.search(["UNSEEN", ["SINCE", since]], (err, results) => {
                if (err) {
                  console.error(`❌ IMAP search error in "${folderName}" for ${account.email}:`, err.message)
                  checkNextFolder(folderIndex + 1)
                  return
                }

                if (!results || results.length === 0) {
                  console.log(`📭 No unread emails found in "${folderName}" for ${account.email}`)
                  checkNextFolder(folderIndex + 1)
                  return
                }

                // Limit to 20 emails max per folder
                const uids = results.slice(0, 20)
                console.log(
                  `📧 Found ${results.length} unread emails in "${folderName}", processing ${uids.length} for ${account.email}`,
                )

                const fetch = imap.fetch(uids, {
                  bodies: "HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)",
                  struct: true,
                })

                fetch.on("message", (msg, seqno) => {
                  let headers = ""
                  let uid = 0

                  msg.on("body", (stream, info) => {
                    stream.on("data", (chunk) => {
                      headers += chunk.toString("ascii")
                    })
                  })

                  msg.once("attributes", (attrs) => {
                    uid = attrs.uid
                  })

                  msg.once("end", () => {
                    try {
                      const lines = headers.split("\r\n")
                      let subject = ""
                      let from = ""
                      let date = new Date()
                      let messageId = ""

                      for (const line of lines) {
                        if (line.toLowerCase().startsWith("subject:")) {
                          subject = line.substring(8).trim()
                        } else if (line.toLowerCase().startsWith("from:")) {
                          from = line.substring(5).trim()
                          // Extract email from "Name <email>" format
                          const emailMatch = from.match(/<([^>]+)>/)
                          if (emailMatch) {
                            from = emailMatch[1]
                          }
                        } else if (line.toLowerCase().startsWith("date:")) {
                          date = new Date(line.substring(5).trim())
                        } else if (line.toLowerCase().startsWith("message-id:")) {
                          messageId = line.substring(11).trim()
                        }
                      }

                      console.log(`📄 Parsed email in "${folderName}": "${subject}" from ${from}`)

                      allEmails.push({
                        subject,
                        sender: from,
                        receivedAt: date,
                        messageId,
                        uid,
                      })
                    } catch (parseError) {
                      console.error(
                        `❌ Error parsing email headers in "${folderName}" for ${account.email}:`,
                        parseError,
                      )
                    }
                  })
                })

                fetch.once("error", (err) => {
                  console.error(`❌ IMAP fetch error in "${folderName}" for ${account.email}:`, err.message)
                  checkNextFolder(folderIndex + 1)
                })

                fetch.once("end", () => {
                  console.log(`✅ Finished fetching emails from "${folderName}" for ${account.email}`)
                  checkNextFolder(folderIndex + 1)
                })
              })
            })
          }

          checkNextFolder(0)
        })

        console.log(`🚀 Initiating IMAP connection for ${account.email}`)
        imap.connect()
      } catch (error) {
        console.error(`❌ IMAP setup error for ${account.email}:`, error)
        resolve([])
      }
    })
  }

  private async getSenderFamiliarity(seedEmailId: string): Promise<Map<string, SenderFamiliarity>> {
    const familiarity = await sql`
      SELECT "senderEmail", "trustScore", "engagementCount"
      FROM "SenderFamiliarity"
      WHERE "seedEmailId" = ${seedEmailId}
    `

    const map = new Map<string, SenderFamiliarity>()
    for (const row of familiarity) {
      map.set(row.senderEmail, {
        senderEmail: row.senderEmail,
        trustScore: Number.parseFloat(row.trustScore),
        engagementCount: row.engagementCount,
      })
    }

    return map
  }

  private async shouldEngageWithEmail(
    account: SeedAccount,
    email: EmailToProcess,
    senderFamiliarity: Map<string, SenderFamiliarity>,
  ): Promise<boolean> {
    const personality = this.PERSONALITY_CONFIGS[account.personalityType as keyof typeof this.PERSONALITY_CONFIGS]
    const baseOpenRate = personality.baseOpenRate

    // Calculate engagement score
    let score = baseOpenRate

    // Sender familiarity bonus
    const familiarity = senderFamiliarity.get(email.sender)
    if (familiarity) {
      score += familiarity.trustScore * 0.2 // Up to 20% bonus for familiar senders
      console.log(`🤝 Familiarity bonus for ${email.sender}: +${(familiarity.trustScore * 0.2 * 100).toFixed(1)}%`)
    }

    // Recency factor (newer emails more likely to be opened)
    const hoursOld = (Date.now() - email.receivedAt.getTime()) / (1000 * 60 * 60)
    if (hoursOld < 1) {
      score += 0.1 // 10% bonus for very recent emails
      console.log(`⚡ Recent email bonus: +10%`)
    } else if (hoursOld > 24) {
      score -= 0.2 // 20% penalty for old emails
      console.log(`⏰ Old email penalty: -20%`)
    }

    // Subject line interest (basic keyword matching)
    const interestingKeywords = ["urgent", "important", "action required", "reminder", "invoice", "receipt"]
    const boringKeywords = ["unsubscribe", "newsletter", "promotion", "sale"]

    const subject = email.subject.toLowerCase()
    if (interestingKeywords.some((keyword) => subject.includes(keyword))) {
      score += 0.15
      console.log(`🎯 Interesting subject bonus: +15%`)
    }
    if (boringKeywords.some((keyword) => subject.includes(keyword))) {
      score -= 0.1
      console.log(`😴 Boring subject penalty: -10%`)
    }

    // Random factor
    const randomFactor = (Math.random() - 0.5) * 0.2
    score += randomFactor
    console.log(`🎲 Random factor: ${randomFactor > 0 ? "+" : ""}${(randomFactor * 100).toFixed(1)}%`)

    // Ensure score is between 0 and 1
    score = Math.max(0, Math.min(1, score))

    const decision = Math.random() < score
    console.log(`📊 Final score: ${(score * 100).toFixed(1)}% -> ${decision ? "ENGAGE" : "SKIP"}`)

    return decision
  }

  private async engageWithEmail(account: SeedAccount, email: EmailToProcess): Promise<void> {
    console.log(`🎬 Actually engaging with email: ${account.email} -> "${email.subject}" from ${email.sender}`)

    if (shouldUseGraphAPI(account.provider)) {
      console.log(`📊 Using Graph API to mark as read`)
      await this.markOutlookEmailAsRead(account, email)
    } else {
      console.log(`📨 Using IMAP to mark as read`)
      await this.markImapEmailAsRead(account, email)
    }
  }

  private async markOutlookEmailAsRead(account: SeedAccount, email: EmailToProcess): Promise<void> {
    try {
      console.log(`🔑 Getting access token for Outlook engagement`)
      const accessToken = await getValidAccessToken(account.id)
      if (!accessToken || !email.graphId) {
        throw new Error("No access token or graph ID available")
      }

      const url = `https://graph.microsoft.com/v1.0/me/messages/${email.graphId}`
      console.log(`🌐 Making PATCH request to mark email as read`)

      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isRead: true,
        }),
      })

      if (!response.ok) {
        throw new Error(`Graph API error: ${response.status} ${response.statusText}`)
      }

      console.log(`✅ Successfully marked Outlook email as read: "${email.subject}"`)
    } catch (error) {
      console.error(`❌ Failed to mark Outlook email as read:`, error)
      throw error
    }
  }

  private async markImapEmailAsRead(account: SeedAccount, email: EmailToProcess): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`🔐 Decrypting password for IMAP engagement`)
        const password =
          account.twoFactorEnabled && account.appPassword ? decrypt(account.appPassword) : decrypt(account.password)

        const serverSettings = getServerSettings(account.provider)
        if (!serverSettings?.imap) {
          reject(new Error("No IMAP settings available"))
          return
        }

        console.log(`🔗 Connecting to IMAP for engagement: ${serverSettings.imap.host}`)

        const imap = new Imap({
          user: account.email,
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
            console.log(`⏰ IMAP engagement timeout for ${account.email}`)
            try {
              imap.end()
            } catch (e) {}
            reject(new Error("Connection timeout"))
          }
        }, 15000)

        imap.once("error", (err) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            console.error(`❌ IMAP engagement error:`, err.message)
            reject(err)
          }
        })

        imap.once("ready", () => {
          console.log(`✅ IMAP connected for engagement`)
          imap.openBox("INBOX", false, (err, box) => {
            if (err) {
              if (!resolved) {
                resolved = true
                clearTimeout(timeout)
                console.error(`❌ Failed to open INBOX for engagement:`, err.message)
                imap.end()
                reject(err)
              }
              return
            }

            if (!email.uid) {
              if (!resolved) {
                resolved = true
                clearTimeout(timeout)
                console.error(`❌ No UID available for email: "${email.subject}"`)
                imap.end()
                reject(new Error("No UID available for email"))
              }
              return
            }

            console.log(`🏷️ Marking email UID ${email.uid} as read`)
            // Mark the email as read using the UID
            imap.addFlags(email.uid, ["\\Seen"], (err) => {
              if (!resolved) {
                resolved = true
                clearTimeout(timeout)
                imap.end()

                if (err) {
                  console.error(`❌ Failed to mark email as read:`, err.message)
                  reject(err)
                } else {
                  console.log(`✅ Successfully marked IMAP email as read: "${email.subject}"`)
                  resolve()
                }
              }
            })
          })
        })

        console.log(`🚀 Initiating IMAP connection for engagement`)
        imap.connect()
      } catch (error) {
        console.error(`❌ IMAP engagement setup error:`, error)
        reject(error)
      }
    })
  }

  private async logEngagement(
    seedEmailId: string,
    action: string,
    email: EmailToProcess,
    success = true,
    errorMessage?: string,
  ): Promise<void> {
    console.log(`📝 Logging engagement: ${action} for "${email.subject}" - ${success ? "SUCCESS" : "FAILED"}`)

    await sql`
      INSERT INTO "EngagementLog" (
        "seedEmailId", 
        "action", 
        "emailSubject", 
        "emailSender", 
        "emailReceivedAt", 
        "success", 
        "errorMessage"
      ) VALUES (
        ${seedEmailId}, 
        ${action}, 
        ${email.subject}, 
        ${email.sender}, 
        ${email.receivedAt.toISOString()}, 
        ${success}, 
        ${errorMessage || null}
      )
    `
  }

  private async updateSenderFamiliarity(seedEmailId: string, senderEmail: string): Promise<void> {
    console.log(`🤝 Updating sender familiarity for: ${senderEmail}`)

    await sql`
      INSERT INTO "SenderFamiliarity" ("seedEmailId", "senderEmail", "engagementCount", "lastEngagementAt", "trustScore")
      VALUES (${seedEmailId}, ${senderEmail}, 1, CURRENT_TIMESTAMP, 0.6)
      ON CONFLICT ("seedEmailId", "senderEmail") 
      DO UPDATE SET 
        "engagementCount" = "SenderFamiliarity"."engagementCount" + 1,
        "lastEngagementAt" = CURRENT_TIMESTAMP,
        "trustScore" = LEAST(1.0, "SenderFamiliarity"."trustScore" + 0.1)
    `
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export async function checkAllSeedEmails() {
  try {
    const accounts = await sql`
      SELECT 
        id,
        email,
        provider,
        password,
        "appPassword",
        "twoFactorEnabled",
        "personality_type" as "personalityType",
        "open_rate_target" as "openRateTarget", 
        "reading_schedule" as "readingSchedule",
        "last_engagement_at" as "lastEngagementAt",
        "engagement_enabled" as "engagementEnabled"
      FROM "SeedEmail"
      WHERE "engagement_enabled" = 'true'
      AND email IS NOT NULL
      AND password IS NOT NULL
      AND locked = 'false'
      AND ("assignedToClient" IS NULL OR "assignedToClient" != 'RIP')
    `
  } catch (error) {
    console.error("❌ Error checking all seed emails:", error)
  } finally {
    await prisma.$disconnect()
  }
}
