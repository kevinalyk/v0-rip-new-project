import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getValidAccessToken } from "@/lib/microsoft-oauth"
import { decrypt } from "@/lib/encryption"

export async function POST(request: Request) {
  try {
    console.log("🔍 Starting Outlook diagnostics...")

    // Use the same auth method as other working endpoints
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.userId) {
      console.log("❌ Authentication failed")
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    console.log("✅ Authenticated as:", currentUser.email)
    console.log("🔍 Starting Outlook diagnostics for riptest4@outlook.com...")

    // Find the specific Outlook account
    const outlookAccount = await prisma.seedEmail.findFirst({
      where: {
        email: "riptest4@outlook.com",
      },
    })

    if (!outlookAccount) {
      return NextResponse.json({ error: "riptest4@outlook.com not found" }, { status: 404 })
    }

    console.log("📧 Found account:", outlookAccount.email)
    console.log("🔗 OAuth connected:", outlookAccount.oauthConnected)
    console.log("⏰ Token expiry:", outlookAccount.tokenExpiry)

    const diagnostics: any = {
      email: outlookAccount.email,
      oauthConnected: outlookAccount.oauthConnected,
      tokenExpiry: outlookAccount.tokenExpiry,
      hasAccessToken: !!outlookAccount.accessToken,
      hasRefreshToken: !!outlookAccount.refreshToken,
    }

    // Test 1: Check if we can get a valid access token
    console.log("🔑 Testing access token retrieval...")
    try {
      const accessToken = await getValidAccessToken(outlookAccount.id)
      diagnostics.tokenRetrievalSuccess = !!accessToken
      diagnostics.accessTokenPreview = accessToken ? accessToken.substring(0, 20) + "..." : null
      console.log("✅ Access token retrieved successfully")
    } catch (error) {
      console.log("❌ Failed to get access token:", error)
      diagnostics.tokenRetrievalSuccess = false
      diagnostics.tokenError = error instanceof Error ? error.message : "Unknown error"
    }

    // Test 2: Check token scopes by decoding the access token
    if (diagnostics.tokenRetrievalSuccess && outlookAccount.accessToken) {
      console.log("🔍 Checking token scopes...")
      try {
        const decryptedToken = decrypt(outlookAccount.accessToken)

        // Make a test call to get token info
        const tokenInfoResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: {
            Authorization: `Bearer ${decryptedToken}`,
            "Content-Type": "application/json",
          },
        })

        if (tokenInfoResponse.ok) {
          const userInfo = await tokenInfoResponse.json()
          diagnostics.userInfo = {
            displayName: userInfo.displayName,
            mail: userInfo.mail,
            userPrincipalName: userInfo.userPrincipalName,
          }
          console.log("✅ Token is valid for basic user info")
        } else {
          console.log("❌ Token failed basic user info test:", tokenInfoResponse.status)
          diagnostics.basicTokenTest = false
        }
      } catch (error) {
        console.log("❌ Error testing token:", error)
        diagnostics.tokenTestError = error instanceof Error ? error.message : "Unknown error"
      }
    }

    // Test 3: Try to fetch emails (read permission)
    if (diagnostics.tokenRetrievalSuccess && outlookAccount.accessToken) {
      console.log("📬 Testing email read permissions...")
      try {
        const decryptedToken = decrypt(outlookAccount.accessToken)

        const emailsResponse = await fetch(
          "https://graph.microsoft.com/v1.0/me/mailfolders/inbox/messages?$top=5&$select=subject,from,receivedDateTime,isRead",
          {
            headers: {
              Authorization: `Bearer ${decryptedToken}`,
              "Content-Type": "application/json",
            },
          },
        )

        if (emailsResponse.ok) {
          const emailsData = await emailsResponse.json()
          diagnostics.emailReadTest = true
          diagnostics.emailCount = emailsData.value?.length || 0
          diagnostics.sampleEmails = emailsData.value?.slice(0, 3).map((email: any) => ({
            subject: email.subject,
            from: email.from?.emailAddress?.address,
            isRead: email.isRead,
          }))
          console.log(`✅ Successfully read ${diagnostics.emailCount} emails`)
        } else {
          const errorText = await emailsResponse.text()
          console.log("❌ Failed to read emails:", emailsResponse.status, errorText)
          diagnostics.emailReadTest = false
          diagnostics.emailReadError = `${emailsResponse.status}: ${errorText}`
        }
      } catch (error) {
        console.log("❌ Error testing email read:", error)
        diagnostics.emailReadTest = false
        diagnostics.emailReadError = error instanceof Error ? error.message : "Unknown error"
      }
    }

    // Test 4: Try to mark an email as read (write permission)
    if (diagnostics.emailReadTest && diagnostics.sampleEmails && diagnostics.sampleEmails.length > 0) {
      console.log("✏️ Testing email write permissions...")
      try {
        const decryptedToken = decrypt(outlookAccount.accessToken!)

        // Get a specific email ID first
        const emailsResponse = await fetch(
          "https://graph.microsoft.com/v1.0/me/mailfolders/inbox/messages?$top=1&$select=id,subject,isRead",
          {
            headers: {
              Authorization: `Bearer ${decryptedToken}`,
              "Content-Type": "application/json",
            },
          },
        )

        if (emailsResponse.ok) {
          const emailsData = await emailsResponse.json()
          if (emailsData.value && emailsData.value.length > 0) {
            const testEmail = emailsData.value[0]
            console.log(`🎯 Testing write permission on email: "${testEmail.subject}"`)

            // Try to update the email (just toggle read status back to what it was)
            const updateResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${testEmail.id}`, {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${decryptedToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                isRead: testEmail.isRead, // Set it to the same value (no actual change)
              }),
            })

            if (updateResponse.ok) {
              diagnostics.emailWriteTest = true
              console.log("✅ Email write permission test successful")
            } else {
              const errorText = await updateResponse.text()
              console.log("❌ Email write permission test failed:", updateResponse.status, errorText)
              diagnostics.emailWriteTest = false
              diagnostics.emailWriteError = `${updateResponse.status}: ${errorText}`
            }
          }
        }
      } catch (error) {
        console.log("❌ Error testing email write:", error)
        diagnostics.emailWriteTest = false
        diagnostics.emailWriteError = error instanceof Error ? error.message : "Unknown error"
      }
    }

    console.log("🏁 Outlook diagnostics completed")
    return NextResponse.json({
      success: true,
      diagnostics,
    })
  } catch (error) {
    console.error("❌ Outlook diagnostics error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
