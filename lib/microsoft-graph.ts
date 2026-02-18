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
  const maxRetries = 3
  const retryDelays = [1000, 2000, 4000] // exponential backoff

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const filterDate = startDate.toISOString()

      const url =
        `https://graph.microsoft.com/v1.0/me/mailfolders/${folderName}/messages?` +
        `$filter=receivedDateTime ge ${filterDate}&` +
        `$select=subject,from,receivedDateTime,internetMessageId,body&` +
        `$orderby=receivedDateTime desc&` +
        `$top=${Math.min(maxEmails, 50)}`

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 45000) // 45 second timeout

      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          
          // Retry on 429 (rate limit), 500s, and 504 (timeout)
          if (response.status === 429 || response.status >= 500) {
            if (attempt < maxRetries - 1) {
              const delay = retryDelays[attempt]
              console.log(`Graph API error ${response.status} for ${folderName}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
              await new Promise(resolve => setTimeout(resolve, delay))
              continue
            }
          }
          
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
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        
        // Retry on timeout or network errors
        if (fetchError.name === 'AbortError' || fetchError.message?.includes('fetch')) {
          if (attempt < maxRetries - 1) {
            const delay = retryDelays[attempt]
            console.log(`Timeout fetching ${folderName}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
        }
        throw fetchError
      }
    } catch (error) {
      if (attempt === maxRetries - 1) {
        console.error(`Error fetching from ${folderName} after ${maxRetries} attempts:`, error)
        return []
      }
    }
  }

  return []
}

export function shouldUseGraphAPI(provider: string): boolean {
  const outlookProviders = ["outlook", "hotmail", "live"]
  return outlookProviders.includes(provider.toLowerCase())
}
