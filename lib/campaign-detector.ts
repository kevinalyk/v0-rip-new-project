import prisma from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"
import { v4 as uuidv4 } from "uuid"
import * as Imap from "node-imap"
import { simpleParser } from "mailparser"
import { getServerSettings } from "@/lib/email-connection"
import { fetchOutlookEmails, shouldUseGraphAPI } from "@/lib/microsoft-graph"
import { processCompetitiveInsights } from "@/lib/competitive-insights-utils"
import { findEntityForSender } from "@/lib/ci-entity-utils"

// Interface for detected campaigns
interface DetectedCampaign {
  fingerprint: string
  sender: string
  senderEmail: string
  subject: string
  day: string
  count: number
  emails: Array<{
    seedEmail: string
    receivedDate: Date
    placement: "inbox" | "spam" | "social" | "promotions" | "other"
    messageId?: string
    to?: string // Added to track which email received it
  }>
}

// Interface for Email
interface Email {
  subject: string
  from: { name: string; address: string }
  date: Date
  placement: "inbox" | "spam" | "social" | "promotions" | "other"
  messageId?: string
  emailContent?: string
  to?: string // Added 'to' field to return type
}

/**
 * Format date for IMAP search - "May 20, 2010" format
 */
function formatDateForImap(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

  const month = months[date.getMonth()]
  const day = date.getDate()
  const year = date.getFullYear()

  return `${month} ${day}, ${year}`
}

/**
 * Normalize a subject line by removing extra spaces and common prefixes
 */
export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd|fw|forward):\s*/i, "") // Remove prefixes
    .replace(/\s+/g, " ") // Replace multiple spaces with a single space
    .trim() // Remove leading/trailing spaces
    .toLowerCase() // Convert to lowercase
}

/**
 * Sanitize subject line by replacing seed email addresses with [Email]
 * This prevents exposing seed email addresses in subject lines while preserving sender emails
 */
export function sanitizeSubject(subject: string, seedEmails: string[] = []): string {
  if (seedEmails.length === 0) {
    // If no seed emails provided, don't sanitize anything
    return subject
  }

  let sanitized = subject
  // Only replace seed email addresses
  for (const seedEmail of seedEmails) {
    // Escape special regex characters in email
    const escapedEmail = seedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const emailPattern = new RegExp(escapedEmail, "gi")
    sanitized = sanitized.replace(emailPattern, "[Email]")
  }

  return sanitized
}

/**
 * Create a campaign fingerprint from sender, subject, and day
 */
export function createCampaignFingerprint(sender: string, subject: string, date: Date): string {
  const normalizedSubject = normalizeSubject(subject)
  const day = date.toISOString().split("T")[0] // YYYY-MM-DD format

  // Create a fingerprint using sender email + normalized subject + day
  return `${sender.toLowerCase()}|${normalizedSubject}|${day}`
}

/**
 * Check if a domain is blocked
 */
async function isDomainBlocked(emailDomain: string): Promise<boolean> {
  const normalizedDomain = emailDomain.toLowerCase()

  const blockedDomain = await prisma.blockedDomain.findFirst({
    where: {
      domain: {
        equals: normalizedDomain,
        mode: "insensitive",
      },
    },
  })

  return !!blockedDomain
}

/**
 * Find or create a domain based on email address
 */
async function findOrCreateDomainForEmail(fromEmail: string, clientId: string | null = null): Promise<string> {
  const emailDomain = fromEmail.split("@")[1]?.toLowerCase()
  if (!emailDomain) {
    throw new Error(`Invalid email address: ${fromEmail}`)
  }

  const isBlocked = await isDomainBlocked(emailDomain)
  if (isBlocked) {
    console.log(`Skipping blocked domain: ${emailDomain}`)
    return ""
  }

  let domain = await prisma.domain.findFirst({
    where: {
      domain: {
        contains: emailDomain,
        mode: "insensitive",
      },
      assignedToClientId: clientId,
    },
  })

  if (!domain) {
    const domainExistsForOtherClient = await prisma.domain.findFirst({
      where: {
        domain: {
          contains: emailDomain,
          mode: "insensitive",
        },
        assignedToClientId: {
          not: clientId,
        },
      },
    })

    if (domainExistsForOtherClient) {
      console.log(`Domain ${emailDomain} exists for another client, creating new domain record for client ${clientId}`)
    }

    console.log(`Creating new domain for: ${emailDomain}${clientId ? ` (client: ${clientId})` : ""}`)

    const domainNameWithoutTLD = emailDomain.split(".")[0]

    try {
      const newDomain = await prisma.domain.create({
        data: {
          id: uuidv4(),
          name: domainNameWithoutTLD,
          domain: emailDomain,
          description: `Auto-created domain for ${emailDomain}`,
          active: true,
          assignedToClientId: clientId,
        },
      })

      await prisma.domainSetting.create({
        data: {
          domainId: newDomain.id,
          retentionPeriod: 90,
        },
      })

      domain = newDomain
      console.log(
        `Created new domain: ${domain.name} (${domain.id})${clientId ? ` assigned to client ${clientId}` : ""}`,
      )
    } catch (error) {
      console.error(`Error creating domain ${emailDomain}:`, error)
      throw error
    }
  } else {
    console.log(`Using existing domain: ${domain.name} (${domain.id}) for client ${clientId}`)
  }

  return domain.id
}

/**
 * Scan seed emails for new campaigns (EXCLUDING RIP-locked emails)
 */
export async function scanForNewCampaigns(options: {
  daysToScan?: number
  minInboxCount?: number
  maxEmailsPerSeed?: number
}): Promise<{
  success: boolean
  newCampaigns: number
  totalEmails: number
  error?: string
  campaigns?: DetectedCampaign[]
}> {
  const { daysToScan = 1, minInboxCount = 2, maxEmailsPerSeed = 50 } = options

  try {
    console.log(`🔍 Starting campaign detection scan (${daysToScan} days, min count: ${minInboxCount})`)

    const ripClient = await prisma.client.findFirst({
      where: {
        OR: [{ slug: "rip" }, { name: { contains: "RIP", mode: "insensitive" } }],
      },
      select: { id: true },
    })

    const seedEmails = await prisma.seedEmail.findMany({
      where: {
        active: true,
        NOT: {
          AND: [{ locked: true }, { assignedToClient: ripClient?.id }],
        },
      },
    })

    if (seedEmails.length === 0) {
      return {
        success: false,
        newCampaigns: 0,
        totalEmails: 0,
        error: "No active seed emails found (excluding RIP-locked emails)",
      }
    }

    console.log(`📧 Found ${seedEmails.length} active seed emails to scan (excluding RIP-locked)`)

    // Calculate the date range for scanning
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysToScan)
    console.log(`📅 Scanning emails since: ${startDate.toISOString()}`)

    // Map to store detected campaigns by fingerprint
    const detectedCampaigns = new Map<string, DetectedCampaign>()
    let totalEmailsScanned = 0

    console.log(`🚀 Starting parallel email fetch for ${seedEmails.length} seed emails...`)

    const BATCH_SIZE = 10
    const allEmailResults: Array<{ seedEmail: any; emails: Email[] }> = []

    const seedEmailAddresses = seedEmails.map((s) => s.email)

    // Process seed emails in batches
    for (let i = 0; i < seedEmails.length; i += BATCH_SIZE) {
      const batch = seedEmails.slice(i, i + BATCH_SIZE)

      // Fetch emails in parallel for this batch
      const batchResults = await Promise.all(
        batch.map(async (seedEmail) => {
          try {
            let emails: Email[] = []

            if (shouldUseGraphAPI(seedEmail.provider)) {
              emails = await fetchOutlookEmails(seedEmail, startDate, maxEmailsPerSeed)
            } else {
              emails = await fetchRecentEmailsIMAP(seedEmail, startDate, maxEmailsPerSeed)
            }

            return { seedEmail, emails }
          } catch (error) {
            console.error(`❌ Error fetching ${seedEmail.email}:`, error)
            return { seedEmail, emails: [] }
          }
        }),
      )

      allEmailResults.push(...batchResults)
    }

    console.log(`✅ Finished parallel fetch for all ${seedEmails.length} seed emails`)

    for (const { seedEmail, emails } of allEmailResults) {
      totalEmailsScanned += emails.length

      // Process each email
      for (const email of emails) {
        // Create fingerprint
        const sanitizedSubject = sanitizeSubject(email.subject, seedEmailAddresses)

        const fingerprint = createCampaignFingerprint(email.from.address, sanitizedSubject, email.date)

        // Add to detected campaigns
        if (!detectedCampaigns.has(fingerprint)) {
          detectedCampaigns.set(fingerprint, {
            fingerprint,
            sender: email.from.name,
            senderEmail: email.from.address,
            subject: sanitizedSubject, // Store sanitized subject
            day: email.date.toISOString().split("T")[0],
            count: 1,
            emails: [
              {
                seedEmail: seedEmail.email,
                receivedDate: email.date,
                placement: email.placement,
                messageId: email.messageId,
                to: email.to, // Store the TO field
              },
            ],
          })
        } else {
          const campaign = detectedCampaigns.get(fingerprint)!
          campaign.count++
          campaign.emails.push({
            seedEmail: seedEmail.email,
            receivedDate: email.date,
            placement: email.placement,
            messageId: email.messageId,
            to: email.to, // Store the TO field
          })
        }
      }
    }

    console.log(`📊 Total emails scanned: ${totalEmailsScanned}`)
    console.log(`🎯 Total unique campaigns found: ${detectedCampaigns.size}`)

    // Filter campaigns that meet the threshold
    const validCampaigns = Array.from(detectedCampaigns.values()).filter((campaign) => campaign.count >= minInboxCount)

    console.log(`✅ Valid campaigns (>= ${minInboxCount} occurrences): ${validCampaigns.length}`)

    // Create campaigns in database
    const newCampaigns = await createCampaignsFromDetected(validCampaigns, seedEmails)

    return {
      success: true,
      newCampaigns: newCampaigns.length,
      totalEmails: totalEmailsScanned,
      campaigns: validCampaigns,
    }
  } catch (error) {
    console.error("❌ Error in campaign detection:", error)
    return {
      success: false,
      newCampaigns: 0,
      totalEmails: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Fetch recent emails from a seed email account using IMAP (for non-Outlook providers)
 */
async function fetchRecentEmailsIMAP(
  seedEmail: any,
  startDate: Date,
  maxEmails: number,
  fetchFullBody = false,
): Promise<Email[]> {
  return new Promise(async (resolve, reject) => {
    try {
      // Decrypt password
      const password =
        seedEmail.twoFactorEnabled && seedEmail.appPassword
          ? decrypt(seedEmail.appPassword)
          : decrypt(seedEmail.password)

      // Get server settings
      const serverSettings = getServerSettings(seedEmail.provider)
      if (!serverSettings?.imap) {
        throw new Error(`No IMAP settings for provider: ${seedEmail.provider}`)
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
        authTimeout: 20000,
        connTimeout: 20000,
      })

      const emails: any[] = []
      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          try {
            imap.end()
          } catch (e) {}
          resolve(emails)
        }
      }, 45000) // 45 second timeout per email

      imap.once("error", (err) => {
        console.error(`❌ IMAP error for ${seedEmail.email}:`, err.message)
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve(emails) // Return empty array on error
        }
      })

      imap.once("ready", () => {
        checkInboxFolders()

        function checkInboxFolders() {
          const inboxFolders =
            seedEmail.provider === "gmail" ? ["INBOX", "[Gmail]/Promotions", "[Gmail]/Social"] : ["INBOX"]

          let inboxIndex = 0

          function tryNextInboxFolder() {
            if (inboxIndex >= inboxFolders.length) {
              // Done with inbox folders, check spam
              checkSpamFolder()
              return
            }

            const folderName = inboxFolders[inboxIndex++]

            imap.openBox(folderName, true, (err, box) => {
              if (err) {
                tryNextInboxFolder()
                return
              }

              const formattedDate = formatDateForImap(startDate)

              const searchCriteria = [["SINCE", formattedDate]]

              imap.search(searchCriteria, (err, results) => {
                if (err) {
                  console.error(`❌ Search error in ${folderName} for ${seedEmail.email}:`, err.message)
                  tryNextInboxFolder()
                  return
                }

                if (!results || results.length === 0) {
                  tryNextInboxFolder()
                  return
                }

                const limitedResults = results.slice(-Math.min(results.length, maxEmails))

                const fetch = imap.fetch(limitedResults, {
                  bodies: fetchFullBody ? [""] : ["HEADER"],
                  struct: true,
                })

                let emailsProcessed = 0
                const expectedEmails = limitedResults.length

                fetch.on("message", (msg, seqno) => {
                  msg.on("body", (stream, info) => {
                    let buffer = ""
                    stream.on("data", (chunk) => {
                      buffer += chunk.toString("utf8")
                    })

                    stream.once("end", () => {
                      simpleParser(buffer, {}, (err, parsed) => {
                        if (err) {
                          console.error(`❌ Error parsing email for ${seedEmail.email}:`, err.message)
                          emailsProcessed++
                          checkIfDone()
                          return
                        }

                        let placement: "inbox" | "spam" | "social" | "promotions" | "other" = "inbox"
                        if (folderName.includes("Promotions")) {
                          placement = "inbox" // Treat promotions as inbox
                        } else if (folderName.includes("Social")) {
                          placement = "inbox" // Treat social as inbox
                        }

                        let emailContent: string | undefined
                        if (fetchFullBody) {
                          emailContent = parsed.html || parsed.textAsHtml || parsed.text || ""
                        }

                        const toAddress = parsed.to?.value[0]?.address || parsed.to?.text || ""

                        const email = {
                          subject: parsed.subject || "",
                          from: parsed.from?.value[0] || { name: "", address: "" },
                          date: parsed.date || new Date(),
                          messageId: parsed.messageId,
                          placement,
                          emailContent,
                          to: toAddress, // Include TO field
                        }

                        if (email.subject && email.from && email.date) {
                          emails.push(email)
                        }

                        emailsProcessed++
                        checkIfDone()
                      })
                    })
                  })
                })

                function checkIfDone() {
                  if (emailsProcessed === expectedEmails) {
                    tryNextInboxFolder()
                  }
                }

                fetch.once("error", (err) => {
                  console.error(`❌ Fetch error for ${seedEmail.email}:`, err.message)
                  tryNextInboxFolder()
                })
              })
            })
          }

          tryNextInboxFolder()
        }

        function checkSpamFolder() {
          let spamFolders: string[] = []

          if (seedEmail.provider === "gmail") {
            spamFolders = ["[Gmail]/Spam"]
          } else if (seedEmail.provider === "yahoo") {
            spamFolders = ["Bulk"]
          } else if (seedEmail.provider === "aol") {
            spamFolders = ["Bulk"]
          } else if (seedEmail.provider === "outlook") {
            spamFolders = ["Junk Email"]
          } else {
            spamFolders = ["Spam", "Junk", "Bulk"]
          }

          let folderIndex = 0

          function tryNextFolder() {
            if (folderIndex >= spamFolders.length) {
              if (!resolved) {
                resolved = true
                clearTimeout(timeout)
                imap.end()
                resolve(emails)
              }
              return
            }

            const folderName = spamFolders[folderIndex++]

            imap.openBox(folderName, true, (err, box) => {
              if (err) {
                tryNextFolder()
                return
              }

              const formattedDate = formatDateForImap(startDate)
              const searchCriteria = [["SINCE", formattedDate]]

              imap.search(searchCriteria, (err, results) => {
                if (err || !results || results.length === 0) {
                  tryNextFolder()
                  return
                }

                const limitedResults = results.slice(-Math.min(results.length, maxEmails))

                const fetch = imap.fetch(limitedResults, {
                  bodies: fetchFullBody ? [""] : ["HEADER"],
                  struct: true,
                })

                let spamEmailsProcessed = 0
                const expectedSpamEmails = limitedResults.length

                fetch.on("message", (msg, seqno) => {
                  msg.on("body", (stream, info) => {
                    let buffer = ""
                    stream.on("data", (chunk) => {
                      buffer += chunk.toString("utf8")
                    })

                    stream.once("end", () => {
                      simpleParser(buffer, {}, (err, parsed) => {
                        if (err) {
                          spamEmailsProcessed++
                          checkIfSpamDone()
                          return
                        }

                        let emailContent: string | undefined
                        if (fetchFullBody) {
                          emailContent = parsed.html || parsed.textAsHtml || parsed.text || ""
                        }

                        const toAddress = parsed.to?.value[0]?.address || parsed.to?.text || ""

                        const email = {
                          subject: parsed.subject || "",
                          from: parsed.from?.value[0] || { name: "", address: "" },
                          date: parsed.date || new Date(),
                          messageId: parsed.messageId,
                          placement: "spam" as const,
                          emailContent,
                          to: toAddress, // Include TO field
                        }

                        if (email.subject && email.from && email.date) {
                          emails.push(email)
                        }

                        spamEmailsProcessed++
                        checkIfSpamDone()
                      })
                    })
                  })
                })

                function checkIfSpamDone() {
                  if (spamEmailsProcessed === expectedSpamEmails) {
                    tryNextFolder()
                  }
                }

                fetch.once("error", (err) => {
                  console.error(`❌ Fetch error for ${seedEmail.email} in ${folderName}:`, err.message)
                  tryNextFolder()
                })
              })
            })
          }

          tryNextFolder()
        }
      })

      // Connect to IMAP server
      imap.connect()
    } catch (error) {
      console.error(`💥 Error fetching emails for ${seedEmail.email}:`, error)
      reject(error)
    }
  })
}

/**
 * Scan ONLY RIP-locked seed emails for competitive insights
 */
export async function scanForCompetitiveInsights(options: {
  daysToScan?: number
  maxEmailsPerSeed?: number
}): Promise<{
  success: boolean
  newInsights: number
  totalEmails: number
  error?: string
}> {
  const { daysToScan = 1, maxEmailsPerSeed = 50 } = options

  try {
    console.log(`🔍 Starting competitive insights scan (${daysToScan} days)`)

    // Get RIP client
    const ripClient = await prisma.client.findFirst({
      where: {
        OR: [{ slug: "rip" }, { name: { contains: "RIP", mode: "insensitive" } }],
      },
      select: { id: true, name: true },
    })

    if (!ripClient) {
      return {
        success: false,
        newInsights: 0,
        totalEmails: 0,
        error: "RIP client not found",
      }
    }

    // Get ONLY RIP-locked seed emails
    // assignedToClient stores the slug string "RIP" (not the cuid), so query both
    const ripSeedEmails = await prisma.seedEmail.findMany({
      where: {
        active: true,
        locked: true,
        OR: [
          { assignedToClient: ripClient.id },
          { assignedToClient: "RIP" },
          { assignedToClient: "rip" },
        ],
      },
    })

    if (ripSeedEmails.length === 0) {
      return {
        success: false,
        newInsights: 0,
        totalEmails: 0,
        error: "No RIP-locked seed emails found",
      }
    }

    console.log(`🔒 Found ${ripSeedEmails.length} RIP-locked seed emails for competitive insights`)

    // Calculate the date range for scanning
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysToScan)
    console.log(`📅 Scanning emails since: ${startDate.toISOString()}`)

    let totalEmailsScanned = 0
    const allEmailsByFingerprint = new Map<
      string,
      Array<{
        seedEmail: string
        placement: "inbox" | "spam" | "social" | "promotions" | "other"
        subject: string
        senderName: string
        senderEmail: string
        date: Date
        messageId?: string
        emailContent?: string
        to?: string
      }>
    >()

    console.log(`🚀 Starting parallel email fetch for ${ripSeedEmails.length} RIP seed emails...`)

    const BATCH_SIZE = 10
    const allEmailResults: Array<{ seedEmail: any; emails: Email[] }> = []

    const ripSeedEmailAddresses = ripSeedEmails.map((s) => s.email)

    // Process seed emails in batches
    for (let i = 0; i < ripSeedEmails.length; i += BATCH_SIZE) {
      const batch = ripSeedEmails.slice(i, i + BATCH_SIZE)

      // Fetch emails in parallel for this batch
      const batchResults = await Promise.all(
        batch.map(async (seedEmail) => {
          try {
            let emails: Email[] = []

            if (shouldUseGraphAPI(seedEmail.provider)) {
              emails = await fetchOutlookEmails(seedEmail, startDate, maxEmailsPerSeed)
            } else {
              emails = await fetchRecentEmailsIMAP(seedEmail, startDate, maxEmailsPerSeed, true)
            }

            return { seedEmail, emails }
          } catch (error) {
            console.error(`❌ Error fetching ${seedEmail.email}:`, error)
            return { seedEmail, emails: [] }
          }
        }),
      )

      allEmailResults.push(...batchResults)
    }

    console.log(`✅ Finished parallel fetch for all ${ripSeedEmails.length} RIP seed emails`)

    // Group emails by fingerprint
    for (const { seedEmail, emails } of allEmailResults) {
      totalEmailsScanned += emails.length
      for (const email of emails) {
        const sanitizedSubject = sanitizeSubject(email.subject, ripSeedEmailAddresses)
        const fingerprint = createCampaignFingerprint(email.from.address, sanitizedSubject, email.date)

        if (!allEmailsByFingerprint.has(fingerprint)) {
          allEmailsByFingerprint.set(fingerprint, [])
        }

        allEmailsByFingerprint.get(fingerprint)!.push({
          seedEmail: seedEmail.email,
          placement: email.placement,
          subject: sanitizedSubject,
          senderName: email.from.name,
          senderEmail: email.from.address,
          date: email.date,
          messageId: email.messageId,
          emailContent: email.emailContent,
          to: email.to,
        })
      }
    }

    console.log(`📊 Total emails scanned: ${totalEmailsScanned}`)
    console.log(`🎯 Total unique campaigns found: ${allEmailsByFingerprint.size}`)

    // Process each unique campaign for competitive insights
    let newInsightsCount = 0
    let skippedDuplicates = 0

    for (const [fingerprint, emails] of allEmailsByFingerprint.entries()) {
      const firstEmail = emails[0]

      const existing = await prisma.competitiveInsightCampaign.findFirst({
        where: {
          senderEmail: firstEmail.senderEmail,
          subject: firstEmail.subject,
          isDeleted: false, // Only update if not deleted
        },
      })

      if (existing) {
        const inboxCount = emails.filter((e) => e.placement === "inbox").length
        const spamCount = emails.filter((e) => e.placement === "spam").length
        const notDeliveredCount = emails.filter((e) => e.placement === "not_found").length
        const totalCount = emails.length

        // Check if this duplicate came via a personal email — if so, attach clientId
        const existingPersonalClientId = await resolvePersonalClientId(emails)

        await prisma.competitiveInsightCampaign.update({
          where: { id: existing.id },
          data: {
            inboxCount: existing.inboxCount + inboxCount,
            spamCount: existing.spamCount + spamCount,
            notDeliveredCount: existing.notDeliveredCount + notDeliveredCount,
            inboxRate:
              ((existing.inboxCount + inboxCount) /
                (existing.inboxCount + existing.spamCount + existing.notDeliveredCount + totalCount)) *
              100,
            // Only set clientId/source if not already set and we have a personal match
            ...(existingPersonalClientId && !existing.clientId
              ? { clientId: existingPersonalClientId, source: "personal" }
              : {}),
            updatedAt: new Date(),
          },
        })

        skippedDuplicates++
        continue
      }

      const resultsForInsights = emails.map((email) => ({
        seedEmail: email.seedEmail,
        placement: email.placement,
      }))

      const ctaLinksForLookup = firstEmail.emailContent
        ? await extractCTALinksFromEmailContent(firstEmail.emailContent, ripSeedEmailAddresses, firstEmail.subject)
        : []

      const entityAssignment = await findEntityForSender(
        firstEmail.senderEmail,
        firstEmail.senderName,
        ctaLinksForLookup,
        firstEmail.subject,
        firstEmail.emailContent,
      )

      // Resolve clientId from personal email TO address via PersonalEmailDomain table
      const personalClientId = await resolvePersonalClientId(emails)

      try {
        await processCompetitiveInsights(
          firstEmail.senderEmail,
          firstEmail.senderName,
          firstEmail.subject,
          firstEmail.date,
          resultsForInsights,
          firstEmail.emailContent,
          entityAssignment,
          personalClientId,
        )
        newInsightsCount++
        console.log(`✅ Processed NEW campaign with AI: "${firstEmail.subject}"${personalClientId ? ` [personal: ${personalClientId}]` : ""}`)
      } catch (error) {
        console.error(`❌ Error processing competitive insight for "${firstEmail.subject}":`, error)
      }
    }

    console.log(
      `✅ Competitive insights scan complete: ${newInsightsCount} new campaigns processed with AI, ${skippedDuplicates} duplicates skipped`,
    )

    return {
      success: true,
      newInsights: newInsightsCount,
      totalEmails: totalEmailsScanned,
    }
  } catch (error) {
    console.error("❌ Error in competitive insights scan:", error)
    return {
      success: false,
      newInsights: 0,
      totalEmails: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Create campaigns in the database from detected campaigns
 */
async function createCampaignsFromDetected(detectedCampaigns: DetectedCampaign[], seedEmails: any[]): Promise<any[]> {
  const newCampaigns: any[] = []

  for (const detected of detectedCampaigns) {
    try {
      let clientId: string | null = null

      for (const email of detected.emails) {
        // Only extract client slug from TO field if this email was received at inbox@rip-tool.com
        if (email.seedEmail === "inbox@rip-tool.com" && email.to) {
          const clientSlug = extractClientSlugFromRecipient(email.to)
          if (clientSlug) {
            const client = await prisma.client.findUnique({
              where: { slug: clientSlug },
              select: { id: true },
            })
            if (client) {
              clientId = client.id
              console.log(`Found personal email for client ${clientSlug}: ${email.to}`)
              break
            }
          }
        }
      }

      const firstEmailWithContent = detected.emails[0]
      let emailContent: string | undefined

      // Try to fetch email content from the seed email
      const seedEmail = seedEmails.find((se) => se.email === firstEmailWithContent.seedEmail)
      if (seedEmail && firstEmailWithContent.messageId) {
        try {
          if (shouldUseGraphAPI(seedEmail.provider)) {
            // Use Graph API for Outlook
            const emails = await fetchOutlookEmails(seedEmail, new Date(detected.day), 1)
            const matchingEmail = emails.find((e) => e.messageId === firstEmailWithContent.messageId)
            if (matchingEmail) {
              emailContent = matchingEmail.emailContent
            }
          } else {
            // Use IMAP for other providers
            const emails = await fetchRecentEmailsIMAP(
              seedEmail,
              new Date(detected.day),
              1,
              true, // Fetch full body
            )
            const matchingEmail = emails.find((e) => e.messageId === firstEmailWithContent.messageId)
            if (matchingEmail) {
              emailContent = matchingEmail.emailContent
            }
          }
        } catch (error) {
          console.error(`Error fetching full email content for ${firstEmailWithContent.seedEmail}:`, error)
        }
      }

      const ctaLinksForMatching = emailContent
        ? await extractCTALinksFromEmailContent(
            emailContent,
            seedEmails.map((se) => se.email),
            detected.subject,
          )
        : []

      const entityAssignment = await findEntityForSender(
        detected.senderEmail,
        detected.sender,
        ctaLinksForMatching,
        detected.subject,
        emailContent,
      )

      // Process as competitive insight with clientId if it's a personal email
      await processCompetitiveInsights(
        detected.senderEmail,
        detected.sender,
        detected.subject,
        new Date(detected.day),
        detected.emails.map((e) => ({
          seedEmail: e.seedEmail,
          placement: e.placement,
        })),
        emailContent,
        entityAssignment, // Pass entity assignment with method
      )

      // Don't create regular campaign for emails (only for CI)
      // newCampaigns.push(campaign)
    } catch (error) {
      console.error(`Error creating campaign for ${detected.senderEmail}:`, error)
    }
  }

  return newCampaigns
}

function extractClientSlugFromRecipient(recipient: string): string | null {
  // Legacy helper — kept for createCampaignsFromDetected path
  const match = recipient.match(/^([a-zA-Z0-9\-_]+)@realdailyreview\.com$/i)
  return match ? match[1] : null
}

/**
 * Given a list of email TO addresses from an email, resolve which client
 * it belongs to by looking up PersonalEmailDomain records in the DB.
 * If the domain has useSlug=true, the local part (before @) is matched
 * against client slugs. Otherwise the clientId on the domain record is used.
 */
async function resolvePersonalClientId(emails: Array<{ to?: string }>): Promise<string | null> {
  // Collect all unique domains from the TO fields
  const addressMap = new Map<string, string>() // domain → localPart

  for (const email of emails) {
    if (!email.to) continue
    for (const addr of email.to.split(",").map((a) => a.trim().toLowerCase())) {
      const match = addr.match(/^([^@]+)@(.+)$/)
      if (match) addressMap.set(match[2], match[1])
    }
  }

  if (addressMap.size === 0) return null

  // Look up all matching PersonalEmailDomain records in one query
  const domainRecords = await prisma.personalEmailDomain.findMany({
    where: { domain: { in: Array.from(addressMap.keys()) } },
    select: { domain: true, clientId: true, useSlug: true },
  })

  for (const record of domainRecords) {
    if (record.useSlug) {
      // Local part is the client slug — look up by slug
      const slug = addressMap.get(record.domain)
      if (!slug) continue
      const client = await prisma.client.findFirst({
        where: { slug: { equals: slug, mode: "insensitive" } },
        select: { id: true },
      })
      if (client) return client.id
    } else {
      // Entire domain maps to a single client
      return record.clientId
    }
  }

  return null
}

/**
 * Update campaign delivery rate
 */
async function updateCampaignDeliveryRate(campaignId: string) {
  const results = await prisma.result.findMany({
    where: { campaignId },
  })

  const totalResults = results.length
  const inboxedResults = results.filter((r) => r.inboxed).length
  const deliveryRate = totalResults > 0 ? inboxedResults / totalResults : 0

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { deliveryRate },
  })

  console.log(
    `📈 Updated delivery rate for campaign ${campaignId}: ${(deliveryRate * 100).toFixed(1)}% (${inboxedResults}/${totalResults})`,
  )
}

/**
 * Determine email provider based on domain
 */
function determineEmailProvider(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() || ""

  if (domain.includes("gmail")) return "gmail"
  if (domain.includes("yahoo")) return "yahoo"
  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live")) return "outlook"
  if (domain.includes("aol")) return "aol"
  if (domain.includes("icloud") || domain.includes("me.com") || domain.includes("mac.com")) return "icloud"

  return "other"
}

// Function to extract CTA links from email content
async function extractCTALinksFromEmailContent(
  emailContent: string,
  seedEmails: string[],
  emailSubject?: string,
): Promise<Array<{ url: string; finalUrl?: string; originalUrl?: string; type: string }>> {
  const { extractCTALinks } = await import("./competitive-insights-utils")
  return await extractCTALinks(emailContent, seedEmails, emailSubject)
}
