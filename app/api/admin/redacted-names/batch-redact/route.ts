import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { cookies } from "next/headers"
import { jwtVerify } from "jose"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "your-secret-key")

async function verifyAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth_token")?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    if (payload.role !== "super_admin") return null
    return payload
  } catch {
    return null
  }
}

// Replace all occurrences of names in a string (case-sensitive, whole word)
function redactNames(text: string, names: string[]): { result: string; count: number } {
  let result = text
  let totalCount = 0

  for (const name of names) {
    // Escape special regex characters in the name
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    // Use word boundary matching for whole-word, case-sensitive
    const regex = new RegExp(`\\b${escaped}\\b`, "g")
    const matches = result.match(regex)
    if (matches) {
      totalCount += matches.length
      result = result.replace(regex, "[Omitted]")
    }
  }

  return { result, count: totalCount }
}

// POST - Preview how many instances would be affected (dry run)
// PUT - Execute the batch redaction
export async function POST(request: Request) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get all redacted names
    const redactedNames = await prisma.redactedName.findMany()
    const names = redactedNames.map((r) => r.name)

    if (names.length === 0) {
      return NextResponse.json({
        emailCampaigns: { total: 0, affected: 0, instances: 0 },
        smsMessages: { total: 0, affected: 0, instances: 0 },
      })
    }

    // Preview: Count how many records would be affected
    // Check email campaigns
    let emailAffected = 0
    let emailInstances = 0
    const emailTotal = await prisma.competitiveInsightCampaign.count()

    // Process in batches of 500 for preview
    const emailBatchSize = 500
    let emailOffset = 0
    let hasMoreEmails = true

    while (hasMoreEmails) {
      const emails = await prisma.competitiveInsightCampaign.findMany({
        select: { id: true, subject: true, emailContent: true, emailPreview: true, senderName: true },
        skip: emailOffset,
        take: emailBatchSize,
        orderBy: { id: "asc" },
      })

      if (emails.length === 0) {
        hasMoreEmails = false
        break
      }

      for (const email of emails) {
        let recordInstances = 0

        for (const name of names) {
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          const regex = new RegExp(`\\b${escaped}\\b`, "g")

          if (email.subject) {
            const matches = email.subject.match(regex)
            if (matches) recordInstances += matches.length
          }
          if (email.emailContent) {
            const matches = email.emailContent.match(regex)
            if (matches) recordInstances += matches.length
          }
          if (email.emailPreview) {
            const matches = email.emailPreview.match(regex)
            if (matches) recordInstances += matches.length
          }
          if (email.senderName) {
            const matches = email.senderName.match(regex)
            if (matches) recordInstances += matches.length
          }
        }

        if (recordInstances > 0) {
          emailAffected++
          emailInstances += recordInstances
        }
      }

      emailOffset += emailBatchSize
      if (emails.length < emailBatchSize) hasMoreEmails = false
    }

    // Check SMS messages
    let smsAffected = 0
    let smsInstances = 0
    const smsTotal = await prisma.smsQueue.count()

    const smsBatchSize = 500
    let smsOffset = 0
    let hasMoreSms = true

    while (hasMoreSms) {
      const messages = await prisma.smsQueue.findMany({
        select: { id: true, message: true },
        skip: smsOffset,
        take: smsBatchSize,
        orderBy: { id: "asc" },
      })

      if (messages.length === 0) {
        hasMoreSms = false
        break
      }

      for (const sms of messages) {
        let recordInstances = 0

        for (const name of names) {
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          const regex = new RegExp(`\\b${escaped}\\b`, "g")

          if (sms.message) {
            const matches = sms.message.match(regex)
            if (matches) recordInstances += matches.length
          }
        }

        if (recordInstances > 0) {
          smsAffected++
          smsInstances += recordInstances
        }
      }

      smsOffset += smsBatchSize
      if (messages.length < smsBatchSize) hasMoreSms = false
    }

    return NextResponse.json({
      emailCampaigns: { total: emailTotal, affected: emailAffected, instances: emailInstances },
      smsMessages: { total: smsTotal, affected: smsAffected, instances: smsInstances },
    })
  } catch (error) {
    console.error("Error previewing redaction:", error)
    return NextResponse.json({ error: "Failed to preview redaction" }, { status: 500 })
  }
}

// PUT - Execute the actual batch redaction (permanent!)
export async function PUT(request: Request) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const redactedNames = await prisma.redactedName.findMany()
    const names = redactedNames.map((r) => r.name)

    if (names.length === 0) {
      return NextResponse.json({
        success: true,
        emailCampaigns: { processed: 0, modified: 0, instances: 0 },
        smsMessages: { processed: 0, modified: 0, instances: 0 },
      })
    }

    let emailProcessed = 0
    let emailModified = 0
    let emailInstancesRedacted = 0

    // Process email campaigns in batches
    const emailBatchSize = 100
    let emailOffset = 0
    let hasMoreEmails = true

    while (hasMoreEmails) {
      const emails = await prisma.competitiveInsightCampaign.findMany({
        select: { id: true, subject: true, emailContent: true, emailPreview: true, senderName: true },
        skip: emailOffset,
        take: emailBatchSize,
        orderBy: { id: "asc" },
      })

      if (emails.length === 0) {
        hasMoreEmails = false
        break
      }

      for (const email of emails) {
        emailProcessed++
        let modified = false
        const updateData: any = {}

        if (email.subject) {
          const { result, count } = redactNames(email.subject, names)
          if (count > 0) {
            updateData.subject = result
            emailInstancesRedacted += count
            modified = true
          }
        }

        if (email.emailContent) {
          const { result, count } = redactNames(email.emailContent, names)
          if (count > 0) {
            updateData.emailContent = result
            emailInstancesRedacted += count
            modified = true
          }
        }

        if (email.emailPreview) {
          const { result, count } = redactNames(email.emailPreview, names)
          if (count > 0) {
            updateData.emailPreview = result
            emailInstancesRedacted += count
            modified = true
          }
        }

        if (email.senderName) {
          const { result, count } = redactNames(email.senderName, names)
          if (count > 0) {
            updateData.senderName = result
            emailInstancesRedacted += count
            modified = true
          }
        }

        if (modified) {
          await prisma.competitiveInsightCampaign.update({
            where: { id: email.id },
            data: updateData,
          })
          emailModified++
        }
      }

      emailOffset += emailBatchSize
      if (emails.length < emailBatchSize) hasMoreEmails = false
    }

    // Process SMS messages in batches
    let smsProcessed = 0
    let smsModified = 0
    let smsInstancesRedacted = 0

    const smsBatchSize = 100
    let smsOffset = 0
    let hasMoreSms = true

    while (hasMoreSms) {
      const messages = await prisma.smsQueue.findMany({
        select: { id: true, message: true },
        skip: smsOffset,
        take: smsBatchSize,
        orderBy: { id: "asc" },
      })

      if (messages.length === 0) {
        hasMoreSms = false
        break
      }

      for (const sms of messages) {
        smsProcessed++

        if (sms.message) {
          const { result, count } = redactNames(sms.message, names)
          if (count > 0) {
            await prisma.smsQueue.update({
              where: { id: sms.id },
              data: { message: result },
            })
            smsModified++
            smsInstancesRedacted += count
          }
        }
      }

      smsOffset += smsBatchSize
      if (messages.length < smsBatchSize) hasMoreSms = false
    }

    console.log(`[v0] Batch redaction complete: ${emailModified} emails, ${smsModified} SMS modified`)

    return NextResponse.json({
      success: true,
      emailCampaigns: {
        processed: emailProcessed,
        modified: emailModified,
        instances: emailInstancesRedacted,
      },
      smsMessages: {
        processed: smsProcessed,
        modified: smsModified,
        instances: smsInstancesRedacted,
      },
    })
  } catch (error) {
    console.error("Error executing batch redaction:", error)
    return NextResponse.json({ error: "Failed to execute batch redaction" }, { status: 500 })
  }
}
