import { getValidAccessToken } from "@/lib/microsoft-oauth"

interface GraphEmail {
  subject: string
  from: { name: string; address: string }
  date: Date
  placement: "inbox" | "spam" | "other"
  messageId?: string
  emailContent?: string
}

export async function fetchOutlookEmails(seedEmail: any, startDate: Date, maxEmails: number): Promise<GraphEmail[]> {
  try {
    const accessToken = await getValidAccessToken(seedEmail.id)

    if (!accessToken) {
      console.error(`No valid access token for ${seedEmail.email}`)
      return []
    }

    const emails: GraphEmail[] = []

    const inboxEmails = await fetchFromFolder(accessToken, "inbox", startDate, maxEmails)
    emails.push(...inboxEmails.map((email) => ({ ...email, placement: "inbox" as const })))

    const junkEmails = await fetchFromFolder(accessToken, "junkemail", startDate, maxEmails)
    emails.push(...junkEmails.map((email) => ({ ...email, placement: "spam" as const })))

    return emails
  } catch (error) {
    console.error(`Error fetching Outlook emails for ${seedEmail.email}:`, error)
    return []
  }
}

async function fetchFromFolder(
  accessToken: string,
  folderName: string,
  startDate: Date,
  maxEmails: number,
): Promise<
  Array<{
    subject: string
    from: { name: string; address: string }
    date: Date
    messageId?: string
    emailContent?: string
  }>
> {
  try {
    const filterDate = startDate.toISOString()

    const url =
      `https://graph.microsoft.com/v1.0/me/mailfolders/${folderName}/messages?` +
      `$filter=receivedDateTime ge ${filterDate}&` +
      `$select=subject,from,receivedDateTime,internetMessageId,body&` +
      `$orderby=receivedDateTime desc&` +
      `$top=${Math.min(maxEmails, 50)}`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Graph API error for ${folderName}:`, response.status, errorText)
      return []
    }

    const data = await response.json()
    const messages = data.value || []

    const emails = messages.map((message: any) => ({
      subject: message.subject || "",
      from: {
        name: message.from?.emailAddress?.name || "",
        address: message.from?.emailAddress?.address || "",
      },
      date: new Date(message.receivedDateTime),
      messageId: message.internetMessageId,
      emailContent: message.body?.content || "",
    }))

    return emails
  } catch (error) {
    console.error(`Error fetching from ${folderName}:`, error)
    return []
  }
}

export function shouldUseGraphAPI(provider: string): boolean {
  const outlookProviders = ["outlook", "hotmail", "live"]
  return outlookProviders.includes(provider.toLowerCase())
}
