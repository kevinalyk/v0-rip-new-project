# Link Unwrapping Issue - Deep Dive Analysis

## The Problem
Links are coming in unwrapped - some links get unwrapped but others don't. The Test URL Unwrap tool works perfectly, but the cron job doesn't consistently unwrap links.

## Root Cause Identified

### 1. **Links ARE Getting Unwrapped Initially** ✅
When campaigns are created in `lib/competitive-insights-utils.tsx` (lines 1337, 1403):
\`\`\`typescript
const ctaLinks = emailContent ? await extractCTALinks(emailContent, seedEmailsList, sanitizedSubject) : []
ctaLinks: ctaLinks.length > 0 ? JSON.stringify(ctaLinks) : null,
\`\`\`

The `extractCTALinks` function (lines 684-950) DOES call `resolveRedirects()` which unwraps links:
\`\`\`typescript
// Line 886-920: The function unwraps links when processing
const unwrappedResults = await Promise.all(
  topLinks.map(async (link) => {
    try {
      const finalUrl = await resolveRedirects(link.url)  // ← UNWRAPPING HAPPENS HERE
      return {
        url: link.url,
        finalUrl: finalUrl !== link.url ? finalUrl : undefined,
        originalUrl: link.url,
      }
    } catch (error) {
      return { url: link.url }
    }
  })
)
\`\`\`

### 2. **The Problem: Links Get Saved BEFORE Unwrapping Completes** ❌

Here's the timeline of what happens:

\`\`\`
1. Campaign detection cron runs (detect-competitive-insights)
   ↓
2. extractCTALinks() is called
   ↓
3. Links are extracted from HTML
   ↓
4. resolveRedirects() is called for each link
   ↓
5. CAMPAIGN IS SAVED TO DATABASE WITH ctaLinks
   ↓
6. <-- WE'RE HERE NOW
   ↓
7. <-- Hours/days later, unwrap-links cron runs
   ↓
8. Tries to unwrap but links ALREADY HAVE finalURL set
\`\`\`

Look at the unwrap-links cron (lines 364-372):
\`\`\`typescript
for (const link of ctaLinks) {
  if (link.finalURL) {  // ← THIS IS THE PROBLEM
    // Already has finalURL, skip
    updatedCtaLinks.push(link)
    continue
  }
\`\`\`

### 3. **Why Some Links Don't Get Unwrapped**

The cron skips links that ALREADY have a `finalURL` field. But when links are initially saved, some of them DO have `finalURL` set (from the initial unwrapping during campaign creation), so the cron skips them!

#### Three Scenarios:

**Scenario A: Link unwraps successfully during creation**
\`\`\`json
{
  "url": "https://tracking.com/abc",
  "finalURL": "https://donate.com/page",  // ← Has finalURL
  "type": "donation"
}
\`\`\`
→ **Cron skips it** (line 366: `if (link.finalURL)`)

**Scenario B: Link fails to unwrap during creation (timeout, SSL error)**
\`\`\`json
{
  "url": "https://tracking.com/xyz",
  "type": "other"  // ← No finalURL
}
\`\`\`
→ **Cron tries to unwrap it**

**Scenario C: Link unwraps to itself (no redirect)**
\`\`\`json
{
  "url": "https://donate.com/direct",
  "finalURL": undefined,  // ← resolveRedirects returned same URL
  "type": "donation"
}
\`\`\`
→ **Cron tries to unwrap it**

### 4. **Why Test Unwrap Tool Works**

The test unwrap tool (`app/api/admin/test-unwrap-url/route.ts`) ALWAYS unwraps the URL you give it - it doesn't check if it's already unwrapped. It just runs `resolveRedirectsWithSteps()` fresh every time.

## The Mismatch

### Initial Campaign Creation Unwrapping
**File:** `lib/competitive-insights-utils.tsx`
**Function:** `extractCTALinks()` → `resolveRedirects()`
- **Timeout:** 10 seconds per link
- **Method:** Custom fetch with SSL bypass
- **Error handling:** Returns original URL on error
- **Retries:** None
- **Runs:** Once when campaign is created

### Cron Job Unwrapping  
**File:** `app/api/cron/unwrap-links/route.ts`
**Function:** `resolveRedirects()` (same function)
- **Timeout:** 10 seconds per link
- **Method:** Custom fetch with SSL bypass
- **Error handling:** Returns original URL on error
- **Retries:** None
- **Runs:** Daily on all campaigns
- **Problem:** Skips links that already have `finalURL`

## Why This Creates Inconsistent Results

1. **Campaign A** - All links unwrap successfully during creation
   - All links have `finalURL` set
   - Cron skips all links
   - ✅ Looks good

2. **Campaign B** - Some links timeout during creation
   - Some links have `finalURL`, others don't
   - Cron only tries the ones without `finalURL`
   - ⚠️ Mixed results - some unwrapped, some not

3. **Campaign C** - Link unwraps differently on retry
   - First try (creation): Link times out → no `finalURL`
   - Second try (cron): Link succeeds → gets `finalURL`
   - ✅ Eventually works, but delayed

4. **Campaign D** - Link was initially unwrapped wrong
   - First try: Link resolved to redirect page (not final destination)
   - Second try: Cron skips it because it has `finalURL`
   - ❌ **STUCK WITH WRONG UNWRAPPING**

## Visual Example

### What You're Seeing:
\`\`\`
Campaign: "Support Trump 2024"
CTA Links:
1. [✅ Unwrapped] https://tracking.winred.com/abc → https://secure.winred.com/trump/donate
2. [❌ Not Unwrapped] https://go.donaldtrump.com/xyz → (no finalURL)
3. [✅ Unwrapped] https://action.gop/support → https://secure.anedot.com/gop/contribute
\`\`\`

### Why #2 Isn't Unwrapped:
- During campaign creation, it might have returned `finalURL: "https://go.donaldtrump.com/xyz"` (unwrapped to itself, then finalURL set to undefined)
- OR it timed out and saved without `finalURL`
- Cron comes along and tries to unwrap it
- But the cron logic is checking `if (link.finalURL)` - and since it's undefined, it SHOULD try...

Wait, let me check the actual cron logic more carefully...

## The ACTUAL Bug

Looking at lines 364-383 in `app/api/cron/unwrap-links/route.ts`:

\`\`\`typescript
for (const link of ctaLinks) {
  if (link.finalURL) {
    // Already has finalURL, skip
    updatedCtaLinks.push(link)
    continue
  }

  stats.emailCampaigns.processed++

  try {
    const finalURL = await resolveRedirects(link.url)
    const strippedFinalURL = stripQueryParams(finalURL)

    updatedCtaLinks.push({
      ...link,
      finalURL: finalURL,
      strippedFinalURL: strippedFinalURL,
    })
\`\`\`

The bug is: **The cron checks for `link.finalURL` but the actual field name saved is `finalUrl` (lowercase 'u')!**

Let me verify by checking how links are saved...

Looking at `extractCTALinks` return type (line 688):
\`\`\`typescript
Promise<Array<{ url: string; finalUrl?: string; originalUrl?: string; type: string }>>
                              ^^^^^^^^^ lowercase 'u'
\`\`\`

And the actual return (lines 906-920):
\`\`\`typescript
return {
  url: link.url,
  finalUrl: finalUrl !== link.url ? finalUrl : undefined,
         ^^^^^^^^ lowercase 'u'
  originalUrl: link.url,
}
\`\`\`

But the cron checks for (line 366):
\`\`\`typescript
if (link.finalURL) {  // ← UPPERCASE 'URL'
     ^^^^^^^^^ This never matches!
\`\`\`

## The Real Problem: Case Sensitivity Bug

**Saved in database:** `finalUrl` (lowercase 'u')
**Cron checks for:** `finalURL` (uppercase 'URL')

Since JavaScript is case-sensitive, `link.finalURL` is ALWAYS undefined, so the cron ALWAYS tries to unwrap every link, even ones that were successfully unwrapped during creation!

This explains why:
1. ✅ The test tool works - it always unwraps fresh
2. ❌ Some links appear unwrapped, others don't - race conditions and timeouts
3. ❌ Links that worked during creation get re-unwrapped by cron (wasting time)
4. ❌ If a link unwraps differently between runs, you get inconsistent results

## Summary

### The Bug
- Database stores: `finalUrl` (camelCase)
- Cron checks: `finalURL` (wrong case)
- Result: Cron never sees existing unwrapped links, tries to re-unwrap everything

### Why Only "1 of them gets unwrapped"
Not sure what you mean by this specifically, but likely:
- Some links unwrap successfully during campaign creation
- Same links unwrap successfully during cron
- Other links fail both times (SSL errors, timeouts, bad redirects)
- The ones that fail look "not unwrapped" even though both systems tried

### Fix Required
Change line 366 in `app/api/cron/unwrap-links/route.ts` from:
\`\`\`typescript
if (link.finalURL) {
\`\`\`
to:
\`\`\`typescript
if (link.finalUrl) {  // Match the actual field name
\`\`\`

And same for SMS on line 449.

This will make the cron properly skip already-unwrapped links instead of re-processing them.
