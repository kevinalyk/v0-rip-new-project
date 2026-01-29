import prisma from "@/lib/prisma"
import fs from "fs"
import { parse } from "csv-parse/sync"
import { encrypt } from "./encryption"

interface SeedEmailImport {
  email: string
  password: string
  provider: string
  recoveryEmail?: string
  recoveryPhone?: string
  securityInfo?: string
  imapEnabled?: boolean
  popEnabled?: boolean
  twoFactorEnabled?: boolean
  appPassword?: string
  notes?: string
}

/**
 * Import seed emails from a CSV file
 * Expected CSV format:
 * email,password,provider,recoveryEmail,recoveryPhone,securityInfo,imapEnabled,popEnabled,twoFactorEnabled,appPassword,notes
 */
export async function importSeedEmailsFromCSV(
  filePath: string,
  clientName = "RIP",
  locked = false,
): Promise<{
  success: boolean
  imported: number
  updated: number
  errors: string[]
}> {
  try {
    // Read and parse the CSV file
    const fileContent = fs.readFileSync(filePath, "utf8")
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as SeedEmailImport[]

    const result = {
      success: false,
      imported: 0,
      updated: 0,
      errors: [] as string[],
    }

    // Process each record
    for (const record of records) {
      try {
        // Validate required fields
        if (!record.email || !record.password || !record.provider) {
          result.errors.push(`Missing required fields for record: ${JSON.stringify(record)}`)
          continue
        }

        // Encrypt sensitive data
        const encryptedPassword = encrypt(record.password)
        const encryptedAppPassword = record.appPassword ? encrypt(record.appPassword) : undefined

        // Use upsert to update existing records or create new ones
        // Preserve OAuth tokens, ownership, assignment, and lock status on re-uploads
        const existingEmail = await prisma.seedEmail.findUnique({
          where: { email: record.email },
          select: {
            accessToken: true,
            refreshToken: true,
            tokenExpiry: true,
            oauthConnected: true,
            ownedByClient: true,
            assignedToClient: true,
            locked: true,
          },
        })

        await prisma.seedEmail.upsert({
          where: { email: record.email },
          update: {
            password: encryptedPassword,
            provider: record.provider.toLowerCase(),
            recoveryEmail: record.recoveryEmail,
            recoveryPhone: record.recoveryPhone,
            securityInfo: record.securityInfo,
            imapEnabled:
              record.imapEnabled === true ||
              record.imapEnabled === "true" ||
              record.imapEnabled === "TRUE" ||
              record.imapEnabled === "1" ||
              record.imapEnabled === "yes" ||
              record.imapEnabled === "YES",
            popEnabled:
              record.popEnabled === true ||
              record.popEnabled === "true" ||
              record.popEnabled === "TRUE" ||
              record.popEnabled === "1" ||
              record.popEnabled === "yes" ||
              record.popEnabled === "YES",
            twoFactorEnabled:
              record.twoFactorEnabled === true ||
              record.twoFactorEnabled === "true" ||
              record.twoFactorEnabled === "TRUE" ||
              record.twoFactorEnabled === "1" ||
              record.twoFactorEnabled === "yes" ||
              record.twoFactorEnabled === "YES",
            appPassword: encryptedAppPassword,
            notes: record.notes,
            ...(existingEmail && {
              accessToken: existingEmail.accessToken,
              refreshToken: existingEmail.refreshToken,
              tokenExpiry: existingEmail.tokenExpiry,
              oauthConnected: existingEmail.oauthConnected,
              ownedByClient: existingEmail.ownedByClient,
              assignedToClient: existingEmail.assignedToClient,
              locked: existingEmail.locked,
            }),
          },
          create: {
            // Create new record with all fields
            email: record.email,
            password: encryptedPassword,
            provider: record.provider.toLowerCase(),
            recoveryEmail: record.recoveryEmail,
            recoveryPhone: record.recoveryPhone,
            securityInfo: record.securityInfo,
            imapEnabled:
              record.imapEnabled === true ||
              record.imapEnabled === "true" ||
              record.imapEnabled === "TRUE" ||
              record.imapEnabled === "1" ||
              record.imapEnabled === "yes" ||
              record.imapEnabled === "YES",
            popEnabled:
              record.popEnabled === true ||
              record.popEnabled === "true" ||
              record.popEnabled === "TRUE" ||
              record.popEnabled === "1" ||
              record.popEnabled === "yes" ||
              record.popEnabled === "YES",
            twoFactorEnabled:
              record.twoFactorEnabled === true ||
              record.twoFactorEnabled === "true" ||
              record.twoFactorEnabled === "TRUE" ||
              record.twoFactorEnabled === "1" ||
              record.twoFactorEnabled === "yes" ||
              record.twoFactorEnabled === "YES",
            appPassword: encryptedAppPassword,
            notes: record.notes,
            ownedByClient: clientName,
            assignedToClient: clientName === "RIP" ? null : clientName, // RIP seeds go to pool, client seeds auto-assigned
            locked: locked,
          },
        })

        if (existingEmail) {
          result.updated++
        } else {
          result.imported++
        }
      } catch (error) {
        result.errors.push(`Error importing ${record.email}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    result.success = result.errors.length === 0
    return result
  } catch (error) {
    return {
      success: false,
      imported: 0,
      updated: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
}

/**
 * Export seed emails to a CSV file
 */
export async function exportSeedEmailsToCSV(filePath: string): Promise<{
  success: boolean
  exported: number
  error?: string
}> {
  try {
    // Get all seed emails
    const seedEmails = await prisma.seedEmail.findMany({
      select: {
        email: true,
        provider: true,
        creationDate: true,
        recoveryEmail: true,
        recoveryPhone: true,
        imapEnabled: true,
        popEnabled: true,
        twoFactorEnabled: true,
        notes: true,
        active: true,
      },
    })

    // Create CSV header
    let csv =
      "email,provider,creationDate,recoveryEmail,recoveryPhone,imapEnabled,popEnabled,twoFactorEnabled,notes,active\n"

    // Add each record
    seedEmails.forEach((email) => {
      csv += `${email.email},${email.provider},${email.creationDate.toISOString()},${email.recoveryEmail || ""},${
        email.recoveryPhone || ""
      },${email.imapEnabled},${email.popEnabled},${email.twoFactorEnabled},${(email.notes || "")
        .replace(/,/g, ";")
        .replace(/\n/g, " ")},${email.active}\n`
    })

    // Write to file
    fs.writeFileSync(filePath, csv)

    return {
      success: true,
      exported: seedEmails.length,
    }
  } catch (error) {
    return {
      success: false,
      exported: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
