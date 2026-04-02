# Email Compliance Checker - Implementation Plan

## Overview

This feature compares CI emails against Google's Gmail Inboxing Checklist to generate compliance scores. The goal is to determine if Republican emails are being filtered to spam at higher rates than Democratic emails, even when both follow the same technical guidelines.

Reference: `docs/Gmail-Inboxing-Checklist.pdf`

---

## Checkable Items (No AI Required)

### Section 1 — All Senders (Required at any volume)

| # | Requirement | Method |
|---|-------------|--------|
| 1 | SPF authentication | Parse `Authentication-Results` header for `spf=pass` |
| 2 | DKIM authentication | Parse `Authentication-Results` header for `dkim=pass` |
| 3 | TLS transmission | Check `Received` headers for "ESMTPS" or "TLS" |
| 4 | Valid Message-ID | Check `Message-ID` header exists and is RFC-compliant |
| 5 | Not impersonating Gmail | Verify `From:` doesn't end in `@gmail.com` |
| 6 | ARC headers (if forwarded) | Check for `ARC-Authentication-Results` header |

### Section 2 — Bulk Senders (5,000+/day)

| # | Requirement | Method |
|---|-------------|--------|
| 1 | Both SPF AND DKIM | Require both `spf=pass` AND `dkim=pass` |
| 2 | DMARC present | Parse `Authentication-Results` for `dmarc=pass/fail` |
| 3 | DMARC alignment | Compare `From:` domain with SPF/DKIM domain |
| 4 | One-click unsubscribe headers | Check for `List-Unsubscribe-Post: List-Unsubscribe=One-Click` AND `List-Unsubscribe` |
| 5 | Unsubscribe link in body | Scan HTML for links containing "unsubscribe" |

### Section 3 — Content & Formatting

| # | Requirement | Method |
|---|-------------|--------|
| 1 | Single From: address | Parse `From:` header, check for multiple addresses |
| 2 | No fake Re:/Fwd: prefix | Regex check without `In-Reply-To`/`References` headers |
| 3 | Valid From:/To: addresses | Validate email format |
| 4 | No deceptive emojis in subject | Scan for ✓ ✔ ☑ ✅ 🔒 etc. |
| 5 | No hidden HTML/CSS | Scan for `display:none`, `visibility:hidden`, `font-size:0` |

### Section 4 — Display Name Rules

| # | Requirement | Method |
|---|-------------|--------|
| 1 | Display name doesn't include subject text | Fuzzy match comparison |
| 2 | Display name doesn't include recipient name | Check against `To:` address |
| 3 | Display name doesn't imply reply | Regex for `(2)`, `Re:`, email addresses |
| 4 | No deceptive emojis in display name | Same emoji scan as subject |
| 5 | Display name not @gmail.com | String check |

---

## Not Checkable

| Requirement | Reason |
|-------------|--------|
| Spam rate below 0.10% | Requires Google Postmaster Tools access (domain owner only) |
| HTML valid per Living Standard | Complex validation, low ROI |
| No mixed content types | Requires AI classification |
| PTR record (reverse DNS) | Requires external DNS lookup per email |

---

## Implementation Phases

### Phase 1: Database Schema
- Add `rawHeaders` field to `CompetitiveInsightCampaign` model
- Create `CIEmailCompliance` table with boolean columns for each check
- Add score columns (section scores + total score)

### Phase 2: Update Email Capture
- Modify `campaign-detector.ts` to extract and store raw headers
- Use `mailparser`'s `parsed.headers` Map

### Phase 3: Compliance Checker Functions
- Create `lib/email-compliance-checker.ts`
- Pure TypeScript pattern matching, no AI
- Function per check, returns boolean

### Phase 4: CRON Job
- Add compliance checking to CI detection CRON
- Or create separate `check-email-compliance` CRON for backfill

### Phase 5: Reporting UI
- Aggregate compliance by party affiliation
- Compare compliance scores vs inbox rates
- Visualize potential filtering bias

---

## Database Schema

```prisma
model CIEmailCompliance {
  id         String   @id @default(cuid())
  campaignId String   @unique
  campaign   CompetitiveInsightCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  
  // Section 1: All Senders
  hasSpf                 Boolean?
  hasDkim                Boolean?
  hasTls                 Boolean?
  hasValidMessageId      Boolean?
  notImpersonatingGmail  Boolean?
  hasArcHeaders          Boolean?
  
  // Section 2: Bulk Senders
  hasBothSpfAndDkim            Boolean?
  hasDmarc                     Boolean?
  hasDmarcAlignment            Boolean?
  hasOneClickUnsubscribeHeaders Boolean?
  hasUnsubscribeLinkInBody     Boolean?
  
  // Section 3: Content
  hasSingleFromAddress      Boolean?
  noFakeReplyPrefix         Boolean?
  hasValidFromTo            Boolean?
  noDeceptiveEmojisInSubject Boolean?
  noHiddenContent           Boolean?
  
  // Section 4: Display Name
  displayNameClean            Boolean?
  displayNameNoRecipient      Boolean?
  displayNameNoReplyPattern   Boolean?
  displayNameNoDeceptiveEmojis Boolean?
  displayNameNotGmail         Boolean?
  
  // Scores (0.0 - 1.0)
  section1Score Float?
  section2Score Float?
  section3Score Float?
  section4Score Float?
  totalScore    Float?
  
  // Metadata
  rawHeaders String? @db.Text
  checkedAt  DateTime @default(now())
  
  @@index([campaignId])
  @@index([totalScore])
}
```

---

## Expected Outcome

If we can show:
1. Republican emails have **similar or better compliance scores** than Democrat emails
2. But Republican emails have **significantly lower inbox rates**

Then that's evidence of filtering bias beyond Google's stated technical guidelines.
