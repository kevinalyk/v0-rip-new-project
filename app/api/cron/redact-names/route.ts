import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { applyRedaction, findUniqueRedactedSubject } from "@/lib/redaction-utils"

export const runtime = "nodejs"
export const maxDuration = 300

function redactNames(text: string, names: string[]): { result: string; count: number } {
  const original = text
  const result = applyRedaction(text, names) as string
  const originalOmitted = (original.match(/\[Omitted\]/g) || []).length
  const newOmitted = (result.match(/\[Omitted\]/g) || []).length
  return { result, count: newOmitted - originalOmitted }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const redactedNames = await prisma.redactedName.findMany()
    const names = redactedNames.map((r) => r.name)

    if (names.length === 0) {
      return NextResponse.json({ success: true, message: "No redacted names configured", emailsModified: 0, smsModified: 0 })
    }

    let emailModified = 0
    let emailInstancesRedacted = 0
    let smsModified = 0
    let smsInstancesRedacted = 0

    // --- Email campaigns ---
    const emailBatchSize = 100
    let emailOffset = 0

    while (true) {
      const emails = await prisma.competitiveInsightCampaign.findMany({
        select: { id: true, senderEmail: true, subject: true, emailContent: true, emailPreview: true, senderName: true },
        skip: emailOffset,
        take: emailBatchSize,
        orderBy: { id: "asc" },
      })

      if (emails.length === 0) break

      for (const email of emails) {
        let modified = false
        const updateData: Record<string, string> = {}

        if (email.subject) {
          const { result, count } = redactNames(email.subject, names)
          if (count > 0) {
            updateData.subject = await findUniqueRedactedSubject(email.senderEmail, result, email.id)
            emailInstancesRedacted += count
            modified = true
          }
        }
        if (email.emailContent) {
          const { result, count } = redactNames(email.emailContent, names)
          if (count > 0) { updateData.emailContent = result; emailInstancesRedacted += count; modified = true }
        }
        if (email.emailPreview) {
          const { result, count } = redactNames(email.emailPreview, names)
          if (count > 0) { updateData.emailPreview = result; emailInstancesRedacted += count; modified = true }
        }
        if (email.senderName) {
          const { result, count } = redactNames(email.senderName, names)
          if (count > 0) { updateData.senderName = result; emailInstancesRedacted += count; modified = true }
        }

        if (modified) {
          await prisma.competitiveInsightCampaign.update({ where: { id: email.id }, data: updateData })
          emailModified++
        }
      }

      emailOffset += emailBatchSize
      if (emails.length < emailBatchSize) break
    }

    // --- SMS messages ---
    const smsBatchSize = 100
    let smsOffset = 0

    while (true) {
      const messages = await prisma.smsQueue.findMany({
        select: { id: true, message: true },
        skip: smsOffset,
        take: smsBatchSize,
        orderBy: { id: "asc" },
      })

      if (messages.length === 0) break

      for (const sms of messages) {
        if (sms.message) {
          const { result, count } = redactNames(sms.message, names)
          if (count > 0) {
            await prisma.smsQueue.update({ where: { id: sms.id }, data: { message: result } })
            smsModified++
            smsInstancesRedacted += count
          }
        }
      }

      smsOffset += smsBatchSize
      if (messages.length < smsBatchSize) break
    }

    console.log(`[cron/redact-names] Done: ${emailModified} emails (${emailInstancesRedacted} instances), ${smsModified} SMS (${smsInstancesRedacted} instances) redacted`)

    return NextResponse.json({
      success: true,
      emailsModified: emailModified,
      emailInstancesRedacted,
      smsModified,
      smsInstancesRedacted,
    })
  } catch (error) {
    console.error("[cron/redact-names] Error:", error)
    return NextResponse.json({ error: "Failed to run name redaction cron" }, { status: 500 })
  }
}
