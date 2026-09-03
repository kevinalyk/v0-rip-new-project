import { getValidAccessToken } from "@/lib/microsoft-oauth"

interface GraphEmail {
  subject: string
  from: { name: string; address: string }
  date: Date
  placement: "inbox" | "spam" | "other"
  messageId?: string
  emailContent?: string
  rawHeaders?: string
  // Graph API message id (distinct from the RFC 2822 messageId above) — needed to move the message.
  graphMessageId?: string
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
    rawHeaders?: string
    graphMessageId?: string
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
        `$select=id,subject,from,receivedDateTime,internetMessageId,body,internetMessageHeaders&` +
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

        const emails = messages.map((message: any) => {
          // Serialize internetMessageHeaders array into "Name: value\n" format
          // matching the format produced by mailparser for IMAP emails.
          let rawHeaders: string | undefined
          const headersList: Array<{ name: string; value: string }> = message.internetMessageHeaders || []
          if (headersList.length > 0) {
            rawHeaders = headersList.map((h) => `${h.name}: ${h.value}`).join("\n")
          }

          return {
            subject: message.subject || "",
            from: {
              name: message.from?.emailAddress?.name || "",
              address: message.from?.emailAddress?.address || "",
            },
            date: new Date(message.receivedDateTime),
            messageId: message.internetMessageId,
            emailContent: message.body?.content || "",
            rawHeaders,
            graphMessageId: message.id,
          }
        })

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

// Moves a message out of Junk Email and into the Inbox, which also tells Outlook's spam
// filter to stop flagging future mail from that sender the same way. Returns false (never
// throws) on failure so a single failed move never aborts a larger scan.
export async function moveOutlookMessageToInbox(seedEmailId: string, graphMessageId: string): Promise<boolean> {
  try {
    const accessToken = await getValidAccessToken(seedEmailId)
    if (!accessToken) {
      console.error(`No valid access token to move message ${graphMessageId}`)
      return false
    }

    const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${graphMessageId}/move`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ destinationId: "inbox" }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Failed to move Outlook message ${graphMessageId} to inbox:`, response.status, errorText)
      return false
    }

    return true
  } catch (error) {
    console.error(`Error moving Outlook message ${graphMessageId} to inbox:`, error)
    return false
  }
}

// Sends a short auto-reply from a seed mailbox via Graph's sendMail. Threads the reply where
// Graph allows it by setting a "Re:" subject and, when available, an In-Reply-To /
// References header via internetMessageHeaders (requires the "Prefer: IdType=ImmutableId"
// header to be omitted and the tenant to allow custom headers — Graph silently drops the
// property if unsupported, which is fine since threading is a nice-to-have here, not required
// for correctness). Never throws — returns false on any failure so a single bad send never
// aborts a larger batch.
export async function sendOutlookReply(
  seedEmailId: string,
  options: { to: string; subject: string; body: string; inReplyToMessageId?: string | null },
): Promise<boolean> {
  try {
    const accessToken = await getValidAccessToken(seedEmailId)
    if (!accessToken) {
      console.error(`No valid access token to send reply from seed ${seedEmailId}`)
      return false
    }

    const subject = /^re:/i.test(options.subject) ? options.subject : `Re: ${options.subject}`

    const internetMessageHeaders = options.inReplyToMessageId
      ? [
          { name: "In-Reply-To", value: options.inReplyToMessageId },
          { name: "References", value: options.inReplyToMessageId },
        ]
      : undefined

    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "Text", content: options.body },
          toRecipients: [{ emailAddress: { address: options.to } }],
          ...(internetMessageHeaders ? { internetMessageHeaders } : {}),
        },
        saveToSentItems: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Failed to send Outlook reply to ${options.to}:`, response.status, errorText)
      return false
    }

    return true
  } catch (error) {
    console.error(`Error sending Outlook reply to ${options.to}:`, error)
    return false
  }
}
