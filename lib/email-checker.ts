import prisma from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"
import { v4 as uuidv4 } from "uuid"
import * as Imap from "node-imap"
import { fetchOutlookEmails, shouldUseGraphAPI } from "@/lib/microsoft-graph"
import { isLikelyRealCampaign } from "@/lib/email-filters"

interface Campaign {
  id: string
  subject: string
  sender: string
  fromEmail: string
  sentDate: Date
  domainId?: string
}

interface EmailCheckResult {
  totalChecked: number
  newEmails: number
  notDelivered: number
  details: Array<{
    seedEmail: string
    success: boolean
    found: boolean
    delivered: boolean
    placement?: "inbox" | "spam" | "promotions" | "social"
    error?: string
  }>
}

interface CampaignResult {
  id: string
  campaignId: string
  seedEmail: string
  delivered: boolean
  inboxed: boolean
  placementStatus: string
  emailProvider: string
  forwardedAt: Date
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
 * Check emails for a specific campaign (used by the manual refresh button)
 */
export async function checkCampaignEmails(campaign: Campaign): Promise<CampaignResult[]> {
  console.log(`Checking emails for specific campaign: ${campaign.subject}`)

  const campaignDetails = await prisma.campaign.findUnique({
    where: { id: campaign.id },
    select: { assignedToClientId: true, domainId: true },
  })

  // Build where clause to filter seed emails by client assignment
  const whereClause: any = { active: true }

  if (campaignDetails?.assignedToClientId) {
    // Get the client to find their slug/name
    const client = await prisma.client.findUnique({
      where: { id: campaignDetails.assignedToClientId },
      select: { name: true },
    })

    if (client) {
      // Filter seed emails assigned to this client
      whereClause.assignedToClient = client.name
      console.log(`Filtering seed emails for client: ${client.name}`)
    }
  } else if (campaign.domainId) {
    // Fallback to domain filtering if no client assigned
    whereClause.domainId = campaign.domainId
  }

  const seedEmails = await prisma.seedEmail.findMany({
    where: whereClause,
  })

  console.log(`Found ${seedEmails.length} active seed emails to check for campaign ${campaign.id}`)

  const results: CampaignResult[] = []

  // Check each seed email account
  for (const seedEmail of seedEmails) {
    try {
      console.log(`Checking seed email: ${seedEmail.email} for campaign: ${campaign.subject}`)

      const checkResult = await checkSeedEmailForCampaign(seedEmail, campaign)

      if (checkResult.success) {
        // Create or update result record
        const existingResult = await prisma.result.findFirst({
          where: {
            campaignId: campaign.id,
            seedEmail: seedEmail.email,
          },
        })

        const resultData = {
          campaignId: campaign.id,
          seedEmail: seedEmail.email,
          delivered: checkResult.delivered,
          inboxed: checkResult.placement === "inbox",
          placementStatus: checkResult.placement || "not_delivered",
          emailProvider: determineEmailProvider(seedEmail.email),
          emailHeaders: JSON.stringify({}),
          forwardedAt: new Date(),
        }

        let result: any
        if (existingResult) {
          result = await prisma.result.update({
            where: { id: existingResult.id },
            data: resultData,
          })
        } else {
          result = await prisma.result.create({
            data: {
              id: uuidv4(),
              ...resultData,
            },
          })
        }

        results.push(result)
      }

      // Small delay between checks to avoid overwhelming servers
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } catch (error) {
      console.error(`Error checking ${seedEmail.email}:`, error)

      // Create error result
      const errorResult = await prisma.result.create({
        data: {
          id: uuidv4(),
          campaignId: campaign.id,
          seedEmail: seedEmail.email,
          delivered: false,
          inboxed: false,
          placementStatus: "error",
          emailProvider: determineEmailProvider(seedEmail.email),
          emailHeaders: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          forwardedAt: new Date(),
        },
      })

      results.push(errorResult)
    }
  }

  // Update campaign delivery rate
  await updateCampaignDeliveryRate(campaign.id)

  return results
}

export async function checkAllSeedEmails(campaign: Campaign): Promise<EmailCheckResult> {
  const campaignDetails = await prisma.campaign.findUnique({
    where: { id: campaign.id },
    select: { assignedToClientId: true },
  })

  // Build where clause to filter seed emails by client assignment
  const whereClause: any = { active: true }

  if (campaignDetails?.assignedToClientId) {
    const client = await prisma.client.findUnique({
      where: { id: campaignDetails.assignedToClientId },
      select: { name: true },
    })

    if (client) {
      whereClause.assignedToClient = client.name
    }
  } else {
    console.warn("Campaign has no assignedToClientId - skipping to prevent timeout")
    return {
      totalChecked: 0,
      newEmails: 0,
      notDelivered: 0,
      details: [],
    }
  }

  const seedEmails = await prisma.seedEmail.findMany({
    where: whereClause,
  })

  console.log(`Checking ${seedEmails.length} seed emails for campaign: ${campaign.subject}`)

  const results: EmailCheckResult = {
    totalChecked: 0,
    newEmails: 0,
    notDelivered: 0,
    details: [],
  }

  // Check each seed email account
  for (const seedEmail of seedEmails) {
    try {
      const checkResult = await checkSeedEmailForCampaign(seedEmail, campaign)
      results.details.push(checkResult)
      results.totalChecked++

      if (checkResult.found && checkResult.delivered) {
        results.newEmails++
      } else if (!checkResult.delivered) {
        results.notDelivered++
      }

      await new Promise((resolve) => setTimeout(resolve, 1000))
    } catch (error) {
      console.error(`Error checking ${seedEmail.email}:`, error)
      results.details.push({
        seedEmail: seedEmail.email,
        success: false,
        found: false,
        delivered: false,
        error: error instanceof Error ? error.message : String(error),
      })
      results.notDelivered++
    }
  }

  // Generate summary data by provider
  const summaryData: Record<string, any> = {}

  // Get all results for this campaign to build summary
  const allResults = await prisma.result.findMany({
    where: { campaignId: campaign.id },
  })

  // Group results by provider
  for (const result of allResults) {
    const provider = result.emailProvider?.toLowerCase() || "unknown"

    if (!summaryData[provider]) {
      summaryData[provider] = {
        total: 0,
        inbox: 0,
        spam: 0,
        promotions: 0,
        social: 0,
        not_found: 0,
        connection_error: 0,
      }
    }

    summaryData[provider].total++

    if (result.placementStatus === "inbox") {
      summaryData[provider].inbox++
    } else if (result.placementStatus === "spam") {
      summaryData[provider].spam++
    } else if (result.placementStatus === "promotions") {
      summaryData[provider].promotions++
    } else if (result.placementStatus === "social") {
      summaryData[provider].social++
    } else if (result.placementStatus === "not_delivered") {
      summaryData[provider].not_found++
    } else if (result.placementStatus === "error") {
      summaryData[provider].connection_error++
    }
  }

  // Store summary data in campaign
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      summaryData: JSON.stringify(summaryData),
    },
  })

  console.log(`Campaign ${campaign.id} complete: ${results.newEmails} delivered, ${results.notDelivered} not delivered`)

  // Update campaign delivery rate
  await updateCampaignDeliveryRate(campaign.id)

  return results
}

async function checkSeedEmailForCampaign(
  seedEmail: any,
  campaign: Campaign,
): Promise<{
  seedEmail: string
  success: boolean
  found: boolean
  delivered: boolean
  placement?: "inbox" | "spam" | "promotions" | "social"
  error?: string
}> {
  try {
    const existingResult = await prisma.result.findFirst({
      where: {
        campaignId: campaign.id,
        seedEmail: seedEmail.email,
      },
    })

    if (existingResult) {
      return {
        seedEmail: seedEmail.email,
        success: true,
        found: existingResult.delivered,
        delivered: existingResult.delivered,
        placement: existingResult.inboxed ? "inbox" : "spam",
      }
    }

    // Search for the campaign email
    let emailFound: { placement: "inbox" | "spam" | "promotions" | "social"; headers?: any } | null = null

    if (shouldUseGraphAPI(seedEmail.provider)) {
      emailFound = await searchForCampaignEmailGraph(seedEmail, campaign)
    } else {
      let decryptedPassword: string
      if (seedEmail.twoFactorEnabled && seedEmail.appPassword) {
        decryptedPassword = decrypt(seedEmail.appPassword)
      } else {
        decryptedPassword = decrypt(seedEmail.password)
      }

      emailFound = await searchForCampaignEmailImap(seedEmail, decryptedPassword, campaign)
    }

    // Create result record for ALL checks (found or not found)
    const delivered = emailFound !== null
    const inboxed = emailFound?.placement === "inbox"

    await prisma.result.create({
      data: {
        id: uuidv4(),
        campaignId: campaign.id,
        seedEmail: seedEmail.email,
        delivered: delivered,
        inboxed: inboxed,
        placementStatus: emailFound?.placement || "not_delivered",
        emailProvider: determineEmailProvider(seedEmail.email),
        emailHeaders: JSON.stringify(emailFound?.headers || {}),
        forwardedAt: new Date(),
      },
    })

    if (delivered) {
      console.log(`✅ ${seedEmail.email}: ${emailFound!.placement}`)
    } else {
      console.log(`❌ ${seedEmail.email}: not delivered`)
    }

    return {
      seedEmail: seedEmail.email,
      success: true,
      found: delivered,
      delivered: delivered,
      placement: emailFound?.placement,
    }
  } catch (error) {
    console.error(`Error checking ${seedEmail.email}:`, error)

    // Still create a result record for failed checks
    await prisma.result.create({
      data: {
        id: uuidv4(),
        campaignId: campaign.id,
        seedEmail: seedEmail.email,
        delivered: false,
        inboxed: false,
        placementStatus: "error",
        emailProvider: determineEmailProvider(seedEmail.email),
        emailHeaders: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        forwardedAt: new Date(),
      },
    })

    return {
      seedEmail: seedEmail.email,
      success: false,
      found: false,
      delivered: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function searchForCampaignEmailGraph(
  seedEmail: any,
  campaign: Campaign,
): Promise<{ placement: "inbox" | "spam" | "promotions" | "social"; headers?: any } | null> {
  try {
    // Fetch emails from the last few days around campaign sent date
    const searchStartDate = new Date(campaign.sentDate.getTime() - 24 * 60 * 60 * 1000) // 1 day before
    const emails = await fetchOutlookEmails(seedEmail, searchStartDate, 100)

    // Search for matching campaign
    for (const email of emails) {
      // Filter out system emails first
      if (!isLikelyRealCampaign(email.subject, email.from.address, email.from.name)) {
        continue
      }

      // Check if this matches our campaign
      const normalizedCampaignSubject = normalizeSubject(campaign.subject)
      const normalizedEmailSubject = normalizeSubject(email.subject)
      const emailFromMatches = email.from.address.toLowerCase() === campaign.fromEmail.toLowerCase()

      if (emailFromMatches && normalizedEmailSubject.includes(normalizedCampaignSubject)) {
        return {
          placement: email.placement,
          headers: {
            subject: email.subject,
            from: email.from.address,
            date: email.date.toISOString(),
          },
        }
      }
    }

    return null
  } catch (error) {
    console.error(`Graph API error for ${seedEmail.email}:`, error)
    return null
  }
}

async function searchForCampaignEmailImap(
  seedEmail: any,
  password: string,
  campaign: Campaign,
): Promise<{ placement: "inbox" | "spam" | "promotions" | "social"; headers?: any } | null> {
  return new Promise((resolve, reject) => {
    const serverSettings = getServerSettings(seedEmail.provider)

    if (!serverSettings?.imap) {
      reject(new Error(`No IMAP settings for provider: ${seedEmail.provider}`))
      return
    }

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

    imap.once("error", (err) => {
      cleanup()
      reject(err)
    })

    imap.once("ready", () => {
      // First check INBOX
      imap.openBox("INBOX", true, (err, box) => {
        if (err) {
          cleanup()
          reject(err)
          return
        }

        // Fixed search criteria - using nested array format like documentation
        const formattedDate = formatDateForImap(campaign.sentDate)
        const searchCriteria = [
          ["FROM", campaign.fromEmail],
          ["SINCE", formattedDate],
        ]

        imap.search(searchCriteria, (err, results) => {
          if (err) {
            cleanup()
            reject(err)
            return
          }

          if (results && results.length > 0) {
            // Found email in inbox - fetch the first one to verify subject
            const fetch = imap.fetch(results[0], { bodies: "HEADER" })

            fetch.on("message", (msg, seqno) => {
              msg.on("body", (stream, info) => {
                let buffer = ""
                stream.on("data", (chunk) => {
                  buffer += chunk.toString("ascii")
                })
                stream.once("end", () => {
                  // Parse headers and check subject
                  const headers = parseEmailHeaders(buffer)
                  const subject = headers.subject || ""

                  // Filter out system emails
                  if (!isLikelyRealCampaign(subject, campaign.fromEmail)) {
                    checkSpamFolder()
                    return
                  }

                  // Check if subject matches (normalize both)
                  const normalizedCampaignSubject = normalizeSubject(campaign.subject)
                  const normalizedEmailSubject = normalizeSubject(subject)

                  if (normalizedEmailSubject.includes(normalizedCampaignSubject)) {
                    cleanup()
                    resolve({ placement: "inbox", headers })
                  } else {
                    // Subject doesn't match, check spam folder
                    checkSpamFolder()
                  }
                })
              })
            })

            fetch.once("error", (err) => {
              cleanup()
              reject(err)
            })
          } else {
            // No emails found in inbox, check spam folder
            checkSpamFolder()
          }
        })
      })

      const checkSpamFolder = () => {
        // Try common spam folder names
        const spamFolders = [
          "Spam",
          "Junk",
          "[Gmail]/Spam",
          "INBOX.Spam",
          "Junk Email",
          "Bulk",
          "Bulk Mail",
          "INBOX.Bulk",
        ]

        const checkNextSpamFolder = (index: number) => {
          if (index >= spamFolders.length) {
            cleanup()
            resolve(null) // Not found in any folder
            return
          }

          const folderName = spamFolders[index]

          imap.openBox(folderName, true, (err, box) => {
            if (err) {
              // Folder doesn't exist, try next one
              checkNextSpamFolder(index + 1)
              return
            }

            // Fixed search criteria for spam folder too - using nested array format
            const formattedDate = formatDateForImap(campaign.sentDate)
            const searchCriteria = [
              ["FROM", campaign.fromEmail],
              ["SINCE", formattedDate],
            ]

            imap.search(searchCriteria, (err, results) => {
              if (err || !results || results.length === 0) {
                // Not found in this spam folder, try next one
                checkNextSpamFolder(index + 1)
                return
              }

              // Found in spam folder - verify subject
              const fetch = imap.fetch(results[0], { bodies: "HEADER" })

              fetch.on("message", (msg, seqno) => {
                msg.on("body", (stream, info) => {
                  let buffer = ""
                  stream.on("data", (chunk) => {
                    buffer += chunk.toString("ascii")
                  })
                  stream.once("end", () => {
                    const headers = parseEmailHeaders(buffer)
                    const subject = headers.subject || ""

                    // Filter out system emails
                    if (!isLikelyRealCampaign(subject, campaign.fromEmail)) {
                      checkNextSpamFolder(index + 1)
                      return
                    }

                    const normalizedCampaignSubject = normalizeSubject(campaign.subject)
                    const normalizedEmailSubject = normalizeSubject(subject)

                    if (normalizedEmailSubject.includes(normalizedCampaignSubject)) {
                      cleanup()
                      resolve({ placement: "spam", headers })
                    } else {
                      // Subject doesn't match, try next spam folder
                      checkNextSpamFolder(index + 1)
                    }
                  })
                })
              })

              fetch.once("error", (err) => {
                // Error fetching, try next folder
                checkNextSpamFolder(index + 1)
              })
            })
          })
        }

        checkNextSpamFolder(0)
      }

      const checkPromotionsFolder = () => {
        // Try common promotions folder names
        const promotionsFolders = ["Promotions", "[Gmail]/Promotions", "INBOX.Promotions", "Bulk Mail", "INBOX.Bulk"]

        const checkNextPromotionsFolder = (index: number) => {
          if (index >= promotionsFolders.length) {
            checkSpamFolder()
            return
          }

          const folderName = promotionsFolders[index]

          imap.openBox(folderName, true, (err, box) => {
            if (err) {
              // Folder doesn't exist, try next one
              checkNextPromotionsFolder(index + 1)
              return
            }

            // Fixed search criteria for promotions folder too - using nested array format
            const formattedDate = formatDateForImap(campaign.sentDate)
            const searchCriteria = [
              ["FROM", campaign.fromEmail],
              ["SINCE", formattedDate],
            ]

            imap.search(searchCriteria, (err, results) => {
              if (err || !results || results.length === 0) {
                // Not found in this promotions folder, try next one
                checkNextPromotionsFolder(index + 1)
                return
              }

              // Found in promotions folder - verify subject
              const fetch = imap.fetch(results[0], { bodies: "HEADER" })

              fetch.on("message", (msg, seqno) => {
                msg.on("body", (stream, info) => {
                  let buffer = ""
                  stream.on("data", (chunk) => {
                    buffer += chunk.toString("ascii")
                  })
                  stream.once("end", () => {
                    const headers = parseEmailHeaders(buffer)
                    const subject = headers.subject || ""

                    // Filter out system emails
                    if (!isLikelyRealCampaign(subject, campaign.fromEmail)) {
                      checkNextPromotionsFolder(index + 1)
                      return
                    }

                    const normalizedCampaignSubject = normalizeSubject(campaign.subject)
                    const normalizedEmailSubject = normalizeSubject(subject)

                    if (normalizedEmailSubject.includes(normalizedCampaignSubject)) {
                      cleanup()
                      resolve({ placement: "promotions", headers })
                    } else {
                      // Subject doesn't match, try next promotions folder
                      checkNextPromotionsFolder(index + 1)
                    }
                  })
                })
              })

              fetch.once("error", (err) => {
                // Error fetching, try next folder
                checkNextPromotionsFolder(index + 1)
              })
            })
          })
        }

        checkNextPromotionsFolder(0)
      }

      const checkSocialFolder = () => {
        // Try common social folder names
        const socialFolders = ["Social", "[Gmail]/Social", "INBOX.Social", "Social Mail", "INBOX.Social Mail"]

        const checkNextSocialFolder = (index: number) => {
          if (index >= socialFolders.length) {
            checkPromotionsFolder()
            return
          }

          const folderName = socialFolders[index]

          imap.openBox(folderName, true, (err, box) => {
            if (err) {
              // Folder doesn't exist, try next one
              checkNextSocialFolder(index + 1)
              return
            }

            // Fixed search criteria for social folder too - using nested array format
            const formattedDate = formatDateForImap(campaign.sentDate)
            const searchCriteria = [
              ["FROM", campaign.fromEmail],
              ["SINCE", formattedDate],
            ]

            imap.search(searchCriteria, (err, results) => {
              if (err || !results || results.length === 0) {
                // Not found in this social folder, try next one
                checkNextSocialFolder(index + 1)
                return
              }

              // Found in social folder - verify subject
              const fetch = imap.fetch(results[0], { bodies: "HEADER" })

              fetch.on("message", (msg, seqno) => {
                msg.on("body", (stream, info) => {
                  let buffer = ""
                  stream.on("data", (chunk) => {
                    buffer += chunk.toString("ascii")
                  })
                  stream.once("end", () => {
                    const headers = parseEmailHeaders(buffer)
                    const subject = headers.subject || ""

                    // Filter out system emails
                    if (!isLikelyRealCampaign(subject, campaign.fromEmail)) {
                      checkNextSocialFolder(index + 1)
                      return
                    }

                    const normalizedCampaignSubject = normalizeSubject(campaign.subject)
                    const normalizedEmailSubject = normalizeSubject(subject)

                    if (normalizedEmailSubject.includes(normalizedCampaignSubject)) {
                      cleanup()
                      resolve({ placement: "social", headers })
                    } else {
                      // Subject doesn't match, try next social folder
                      checkNextSocialFolder(index + 1)
                    }
                  })
                })
              })

              fetch.once("error", (err) => {
                // Error fetching, try next folder
                checkNextSocialFolder(index + 1)
              })
            })
          })
        }

        checkNextSocialFolder(0)
      }

      if (seedEmail.provider === "gmail") {
        checkPromotionsFolder()
      } else {
        checkSpamFolder()
      }
    })
  })
}

// Helper functions
function getServerSettings(provider: string) {
  const settings: Record<string, any> = {
    gmail: {
      imap: { host: "imap.gmail.com", port: 993, tls: true },
    },
    yahoo: {
      imap: { host: "imap.mail.yahoo.com", port: 993, tls: true },
    },
    outlook: {
      imap: { host: "imap-mail.outlook.com", port: 993, tls: true },
    },
    hotmail: {
      imap: { host: "imap-mail.outlook.com", port: 993, tls: true },
    },
    aol: {
      imap: { host: "imap.aol.com", port: 993, tls: true },
    },
    icloud: {
      imap: { host: "imap.mail.me.com", port: 993, tls: true },
    },
  }

  return settings[provider.toLowerCase()] || settings.gmail
}

function determineEmailProvider(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() || ""

  if (domain.includes("gmail")) return "gmail"
  if (domain.includes("yahoo")) return "yahoo"
  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live")) return "outlook"
  if (domain.includes("aol")) return "aol"
  if (domain.includes("icloud") || domain.includes("me.com") || domain.includes("mac.com")) return "icloud"

  return "other"
}

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd|fw|forward):\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function parseEmailHeaders(headerText: string): Record<string, string> {
  const headers: Record<string, string> = {}
  const lines = headerText.split("\n")

  let currentHeader = ""
  let currentValue = ""

  for (const line of lines) {
    if (line.match(/^\s/)) {
      // Continuation of previous header
      currentValue += " " + line.trim()
    } else {
      // Save previous header
      if (currentHeader) {
        headers[currentHeader.toLowerCase()] = currentValue.trim()
      }

      // Start new header
      const colonIndex = line.indexOf(":")
      if (colonIndex > 0) {
        currentHeader = line.substring(0, colonIndex).trim()
        currentValue = line.substring(colonIndex + 1).trim()
      }
    }
  }

  // Save last header
  if (currentHeader) {
    headers[currentHeader.toLowerCase()] = currentValue.trim()
  }

  return headers
}

async function updateCampaignDeliveryRate(campaignId: string) {
  const results = await prisma.result.findMany({
    where: { campaignId },
  })

  const totalResults = results.length
  const deliveredResults = results.filter((r) => r.delivered).length
  const inboxedResults = results.filter((r) => r.inboxed).length

  const deliveryRate = totalResults > 0 ? deliveredResults / totalResults : 0
  const inboxRate = totalResults > 0 ? inboxedResults / totalResults : 0

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      deliveryRate: inboxRate, // Keep existing field as inbox rate
      // Could add new fields for overall delivery rate if needed
    },
  })

  console.log(
    `Campaign ${campaignId}: ${Math.round(deliveryRate * 100)}% delivered, ${Math.round(inboxRate * 100)}% inbox`,
  )
}
