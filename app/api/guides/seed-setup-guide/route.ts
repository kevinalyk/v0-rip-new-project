import { put, head } from "@vercel/blob"
import { NextResponse } from "next/server"

const PDF_CONTENT = `# SEED LIST EMAIL ACCOUNT SETUP GUIDE
This guide provides detailed instructions for creating and configuring email
accounts across Gmail, Yahoo, Outlook, and AOL for use in the RIP Email Testing
System.

## GENERAL RECOMMENDATIONS
1. Make sure each seed has a different name.
2. Use a complex password. Online generators work great
3. Document all information in a spreadsheet as you go (please make a copy of
this sheet and fill in the information like the example provided:
https://docs.google.com/spreadsheets/d/1bjrlO2eRagLlNi0vH7ph3tznaupKjJnccxgpJL9Z
B4A/edit?usp=sharing)
4. Create accounts gradually (5-10 per day) to avoid provider suspicions
5. Use different IP addresses if possible (mobile data, different networks)
6. Have a dedicated recovery email for these accounts

## INFORMATION TO DOCUMENT FOR EACH ACCOUNT
- Email address
- Password
- Provider
- Recovery email
- Recovery phone (if used)
- Security questions and answers (not needed but security is a column in the sheet. Leave it blank)
- IMAP/POP3 status
- Any special notes

## GMAIL ACCOUNT SETUP
### Creation Process:
1. Go to https://accounts.google.com/signup
2. Click "Create account" and select "For myself"
3. Enter first name, last name (use consistent naming like "RIP Test")
4. Choose username (follow your naming convention + number)
5. Create password (document this)
6. Enter recovery phone number (optional but recommended)
7. Enter recovery email (use your dedicated recovery email)
8. Enter date of birth (use consistent date, but vary slightly)
9. Select gender
10. Skip personalization options
11. Review and accept Google's Terms of Service and Privacy Policy

### Required Settings:
1. Sign in to the newly created Gmail account
2. Click on the gear icon in the top right corner
3. Click "See all settings"
4. Go to the "Forwarding and POP/IMAP" tab
5. Under "IMAP Access", select "Enable IMAP"
   - Turn Auto-Expunge on
6. Under "POP Download", select "Enable POP for all mail"
7. Click "Save Changes"

### Security Settings:
1. Go to https://myaccount.google.com/security
2. Under "Signing in to Google", click on "2-Step Verification"
3. For testing accounts, it's recommended to leave this OFF
4. If you need to enable it, also generate an App Password:
   a. After enabling 2-Step Verification, go back to the Security page
   b. Generate an app password: https://myaccount.google.com/apppasswords
   c. Name the app RIP Tool or something similar.
   d. Generate the code and save it to your document.

### Verification:
1. Send a test email to the account
2. Verify you can log in through webmail
3. Note any additional verification steps Google required

## YAHOO ACCOUNT SETUP
### Creation Process:
1. Go to https://login.yahoo.com/account/create
2. Enter first name, last name (use consistent naming)
3. Choose email address (follow your naming convention)
4. Create password (document this)
5. Enter mobile phone number (required for Yahoo)
6. Enter date of birth
7. Complete the verification process via SMS
8. Skip additional information requests

--PLEASE NOTE THAT IMAP AND POP ARE TURNED ON BY DEFAULT FOR YAHOO--

### Security Settings:
1. In Account security settings, review "Two-step verification"
2. Turn on if not already, and document your email and phone number
3. If enabled, generate app password:

--PLEASE NOTE THAT THIS MAY TAKE A WHILE TO TURN ON. IF NOT AVAILABLE WHEN YOU FIRST SET UP THE SEED, YOU WILL HAVE TO COME BACK--

   a. In Account security, find "Generate app password"
   b. Select "Other app"
   c. Name it "RIP Testing"
   d. Copy and document the password

### Verification:
1. Send a test email to the account
2. Verify you can log in through webmail
3. Note any additional verification steps Yahoo required

## OUTLOOK/HOTMAIL ACCOUNT SETUP
### Creation Process:
1. Go to https://signup.live.com
2. Click "Create free account"
3. Choose email address (follow your naming convention)
4. Create password (document this)
5. Enter first name and last name (use consistent naming)
   - Uncheck "I would like information, tips, and offers about Microsoft products and services."
6. Enter country/region and date of birth
7. Complete the CAPTCHA verification
8. Skip Microsoft's personalization offers

### Required Settings:
1. Sign in to Outlook.com
2. Click on the gear icon in the top-right corner
3. Search for "POP and IMAP" in the settings search box
4. Enable "POP settings" and "IMAP settings"
5. Click "Save"

--You will have to add an email or phone in order to turn this on. Please make sure to document whatever you pick--

### Security Settings:
--You do NOT need to set this up with RIP. We created a custom app to access Outlook emails--

### Verification:
1. Send a test email to the account
2. Verify you can log in through webmail
3. Note any additional verification steps Microsoft required

## AOL ACCOUNT SETUP
### Creation Process:
1. Go to https://login.aol.com/account/create
2. Enter first name, last name (use consistent naming)
3. Choose email address (follow your naming convention)
4. Create password (document this)
5. Enter mobile phone number (required for verification)
6. Enter date of birth
7. Complete the verification process via SMS
8. Skip additional information requests

--PLEASE NOTE THAT IMAP AND POP ARE TURNED ON BY DEFAULT FOR AOL--

### Security Settings:
1. Go to Account security settings
2. Review "2-step verification"
3. For testing accounts, it's recommended to leave this OFF
4. If enabled, generate app password:

--PLEASE NOTE THAT THIS MAY TAKE A WHILE TO TURN ON. IF NOT AVAILABLE WHEN YOU FIRST SET UP THE SEED, YOU WILL HAVE TO COME BACK--

   a. In Account security, find "Generate app password"
   b. Select "Other app"
   c. Name it "RIP Testing"
   d. Copy and document the password

### Verification:
1. Send a test email to the account
2. Verify you can log in through webmail
3. Note any additional verification steps AOL required

## TROUBLESHOOTING COMMON ISSUES
### Account Verification Problems:
- If asked for additional verification, use the provided phone number
- Some providers may require waiting 24-48 hours before enabling all features
- If an account is locked, follow the recovery process using your documented information

### IMAP/POP Access Issues:
- Gmail: Check if you need to allow "less secure apps" in older accounts
- Yahoo/AOL: Verify app password is correct if 2FA is enabled
- Outlook: May require additional security verification for new accounts

### Login Problems:
- Clear cookies and try again
- Use incognito/private browsing mode
- Try a different browser or network
- Wait 24 hours if you've created multiple accounts

## FINAL CHECKLIST FOR EACH ACCOUNT
☐ Account created successfully
☐ IMAP/POP access enabled
☐ Security settings configured appropriately
☐ All account information documented
☐ Test email received successfully
☐ Login verified through webmail
☐ Any special notes or issues documented

## DOCUMENTATION TEMPLATE
Use this link and make a copy:
https://docs.google.com/spreadsheets/d/1bjrlO2eRagLlNi0vH7ph3tznaupKjJnccxgpJL9Z
B4A/edit?usp=sharing

Feel free to download and upload to RIP whenever you make any changes. Our system will automatically update any changes and add any new seed emails when available.`

// Store the blob URL in memory (in production, you'd want to store this in a database)
let cachedBlobUrl: string | null = null

export async function GET() {
  try {
    // If we already have a cached URL, return it
    if (cachedBlobUrl) {
      return NextResponse.json({ url: cachedBlobUrl })
    }

    // Check if the file already exists in Blob storage
    const existingBlobs = await head("guides/seed-email-setup-guide.txt").catch(() => null)

    if (existingBlobs) {
      cachedBlobUrl = existingBlobs.url
      return NextResponse.json({ url: cachedBlobUrl })
    }

    // Upload the PDF content to Blob storage
    const blob = await put("guides/seed-email-setup-guide.txt", PDF_CONTENT, {
      access: "public",
      contentType: "text/plain",
    })

    cachedBlobUrl = blob.url
    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error("Error getting/uploading guide:", error)
    return NextResponse.json({ error: "Failed to get guide URL" }, { status: 500 })
  }
}
