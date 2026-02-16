# Campaign Creation Link Unwrapping Analysis

## Problem Statement
During the campaign creation process (detect-competitive-insights cron), only 1 link gets unwrapped while others remain wrapped. The Test URL Unwrap tool successfully unwraps all links, but the campaign creation process does not.

## The Campaign Creation Flow

### Step 1: Email Processing (detect-competitive-insights cron)
1. Fetches emails from seed accounts via Microsoft Graph API
2. Calls `extractCTALinks(htmlContent)` for each email
3. Saves campaign with CTA links to database

### Step 2: extractCTALinks Function (lib/competitive-insights-utils.tsx)
Lines 684-951 - This is where unwrapping SHOULD happen during campaign creation

**Key Code Flow:**
```typescript
// Line 888-940: Process links with Promise.all
const linksWithFinalUrls = await Promise.all(
  topLinks.map(async (link) => {
    // Line 891-898: Check if link is a tracking link
    const isTrkLink = 
      link.url.includes(".trk.") || 
      link.url.includes("/trk.") ||
      /trk\./.test(link.url) ||
      link.url.includes("tracking") ||
      link.url.includes("click.") ||
      link.url.includes("redirect.") ||
      link.url.includes("links.")
    
    let finalUrl = ""
    let cleanedUrl = ""
    let cleanedFinalUrl = ""
    let isDifferent = false

    if (isTrkLink) {
      // Line 907: ONLY unwraps if link is detected as tracking link
      finalUrl = await resolveRedirects(link.url)
      
      cleanedUrl = stripQueryParams(link.url)
      cleanedFinalUrl = stripQueryParams(finalUrl)
      
      isDifferent = cleanedUrl.toLowerCase() !== cleanedFinalUrl.toLowerCase()
      
      // Line 917-919: Logs warning if unwrapping failed
      if (!isDifferent) {
        console.log(`[v0] ⚠️ Link unwrap failed or unchanged: ${link.url.substring(0, 100)}...`)
      }
    }

    return {
      url: cleanedUrl || link.url,
      finalUrl: isDifferent ? cleanedFinalUrl : undefined,
      text: link.text,
    }
  }),
)
```

## Root Cause Analysis

### Issue #1: Overly Strict Tracking Link Detection
**Lines 891-898** use a very specific pattern matching:

```typescript
const isTrkLink = 
  link.url.includes(".trk.") ||      // Only matches *.trk.* domains
  link.url.includes("/trk.") ||      // Only matches /trk/ paths
  /trk\./.test(link.url) ||          // Same as above
  link.url.includes("tracking") ||    // Too generic, rarely in domain
  link.url.includes("click.") ||      // Only *.click.* domains
  link.url.includes("redirect.") ||   // Only *.redirect.* domains
  link.url.includes("links.")         // Only *.links.* domains
```

**Problems:**
1. **Misses common tracking domains:**
   - `winred.com/trk/abc123` ❌ (no `.trk.` or `/trk.`)
   - `secure.actblue.com/donate/abc` ❌
   - `go.gop.com/abc` ❌
   - `link.donaldjtrump.com/abc` ❌ (matches but still fails other patterns)
   - `action.rnc.org/abc` ❌

2. **Only matches specific formats:**
   - `example.com.trk.email.com` ✅
   - `example.com/trk.php` ✅
   - Most real-world tracking links ❌

### Issue #2: Silent Failures
**Lines 905-932** - If a link is NOT detected as a tracking link:
- `isTrkLink = false`
- Never calls `resolveRedirects()`
- Returns link with `finalUrl: undefined`
- **No error or warning logged**

So you see:
- 1 link unwrapped (the one that matched the strict pattern)
- All other links NOT unwrapped (didn't match pattern, but no indication why)

### Issue #3: Pattern Too Narrow for Real Campaigns
Looking at real donation platforms:
- **WinRed:** `secure.winred.com/...` ❌ (doesn't match any pattern)
- **ActBlue:** `secure.actblue.com/...` ❌
- **Anedot:** `secure.anedot.com/...` ❌
- **NGP VAN:** Various domains ❌

**Only links that would match:**
- `example.trk.domain.com` ✅
- `link.example.com/trk.php` ✅
- Extremely rare in actual political campaigns

## Why Test URL Unwrap Tool Works

The test tool (`app/api/admin/test-unwrap-url/route.ts`) ALWAYS calls `resolveRedirects()` without checking if it's a tracking link:

```typescript
// Test tool just unwraps whatever you give it
const finalUrl = await resolveRedirects(url)
```

No pattern matching → Always works

## Evidence from Code

**Line 886:** Console log shows which links are being processed
```typescript
console.log(`[v0] ${subjectPrefix}Processing ${topLinks.length} links (${trackingLinkCount} tracking): ${linkDomains}`)
```

**Lines 943-946:** Only logs successful unwraps
```typescript
const resolvedLinks = linksWithFinalUrls.filter(link => link.finalUrl)
if (resolvedLinks.length > 0) {
  console.log(`[v0] ✓ Resolved ${resolvedLinks.length} tracking links to final destinations`)
}
```

So if you see "Processing 5 links (1 tracking)" → Only 1 will be unwrapped

## Why This Happens in Your Campaigns

**Typical scenario:**
1. Email contains 5 donation/action links
2. Only 1 matches the strict `isTrkLink` pattern
3. That 1 gets unwrapped successfully
4. Other 4 are saved as-is (wrapped)
5. No error/warning for the 4 that weren't unwrapped

**You'd see in logs:**
```
[v0] "Donate Now" - Processing 5 links (1 tracking): winred.com, actblue.com, example.com, ...
[v0] ✓ Resolved 1 tracking links to final destinations
```

## Solutions

### Option 1: Expand Tracking Link Detection (Conservative)
Add more patterns to catch common political tracking domains:

```typescript
const isTrkLink = 
  // Original patterns
  link.url.includes(".trk.") ||
  link.url.includes("/trk.") ||
  /trk\./.test(link.url) ||
  link.url.includes("tracking") ||
  link.url.includes("click.") ||
  link.url.includes("redirect.") ||
  link.url.includes("links.") ||
  
  // Add common political/donation domains
  /winred\.com/i.test(link.url) ||
  /actblue\.com/i.test(link.url) ||
  /anedot\.com/i.test(link.url) ||
  /ngpvan\.com/i.test(link.url) ||
  /revv\.co/i.test(link.url) ||
  /secure\./i.test(link.url) ||  // Many use secure.domain.com
  /action\./i.test(link.url) ||   // action.domain.com
  /go\./i.test(link.url) ||       // go.domain.com
  /link\./i.test(link.url) ||     // link.domain.com
  /donate\./i.test(link.url)      // donate.domain.com
```

**Pros:** 
- More links get unwrapped
- Still has some filtering logic

**Cons:** 
- Still might miss some domains
- Maintenance burden (adding new platforms)

### Option 2: Unwrap ALL Links (Aggressive)
Remove the `isTrkLink` check entirely - unwrap everything:

```typescript
const linksWithFinalUrls = await Promise.all(
  topLinks.map(async (link) => {
    let finalUrl = ""
    let cleanedUrl = ""
    let cleanedFinalUrl = ""
    let isDifferent = false

    try {
      // ALWAYS try to unwrap
      finalUrl = await resolveRedirects(link.url)
      
      cleanedUrl = stripQueryParams(link.url)
      cleanedFinalUrl = stripQueryParams(finalUrl)
      
      isDifferent = cleanedUrl.toLowerCase() !== cleanedFinalUrl.toLowerCase()
      
      if (!isDifferent) {
        console.log(`[v0] ⚠️ Link unwrap failed or unchanged: ${link.url.substring(0, 100)}...`)
      }
    } catch (error) {
      console.log(`[v0] ❌ Error unwrapping ${link.url}: ${error}`)
      // Return original link on error
      return {
        url: link.url,
        finalUrl: undefined,
        text: link.text,
      }
    }

    return {
      url: cleanedUrl || link.url,
      finalUrl: isDifferent ? cleanedFinalUrl : undefined,
      text: link.text,
    }
  }),
)
```

**Pros:** 
- Unwraps ALL links, no exceptions
- Matches test tool behavior
- No maintenance needed

**Cons:** 
- More API calls (may hit rate limits)
- Slower campaign creation
- Might unwrap links that don't need it

### Option 3: Hybrid Approach (Recommended)
Try to detect tracking links, but unwrap ALL on failure:

```typescript
const linksWithFinalUrls = await Promise.all(
  topLinks.map(async (link) => {
    // Try pattern detection first
    const isLikelyTrackingLink = 
      link.url.includes(".trk.") ||
      // ... other patterns
      
    // BUT ALSO check if link is shortened
    const isShortenedLink = 
      link.url.length < 50 ||  // Short URLs are likely tracking
      /^https?:\/\/[^/]+\/[a-zA-Z0-9_-]{5,15}$/.test(link.url)  // domain.com/abc123
    
    // Unwrap if it's tracking OR shortened OR uncertain
    const shouldUnwrap = isLikelyTrackingLink || isShortenedLink || true  // "|| true" = unwrap all for now
    
    if (shouldUnwrap) {
      try {
        finalUrl = await resolveRedirects(link.url)
        // ... rest of unwrap logic
      } catch (error) {
        console.log(`[v0] Error unwrapping ${link.url}: ${error}`)
      }
    }
    
    return {
      url: cleanedUrl || link.url,
      finalUrl: isDifferent ? cleanedFinalUrl : undefined,
      text: link.text,
    }
  }),
)
```

## Performance Considerations

**Current behavior:**
- Unwraps 1-2 links per email
- Fast campaign creation

**If we unwrap all links:**
- Unwraps 5-15 links per email
- Each `resolveRedirects()` takes 1-10 seconds (multiple redirects)
- Could add 30-60 seconds per email processed
- Risk of hitting Microsoft Graph API rate limits
- Risk of timeouts in cron job (5 minute max)

**Mitigation strategies:**
1. **Batch processing:** Process emails in smaller batches
2. **Parallel limits:** Use `Promise.all()` with concurrency limit (p-limit library)
3. **Caching:** Cache unwrapped URLs (same link appears in multiple emails)
4. **Two-pass approach:** 
   - First pass: Save campaigns quickly with wrapped links
   - Second pass: Background job unwraps all links (existing unwrap-links cron)

## Recommendations

### Short-term (Quick Fix)
1. **Option 1:** Expand tracking patterns to catch common donation platforms
2. Add better logging to show which links are being skipped
3. Let the unwrap-links cron job handle the rest

### Long-term (Proper Fix)
1. **Option 2:** Always unwrap ALL links during campaign creation
2. Implement caching layer for frequently-seen redirect chains
3. Add concurrency limits to prevent rate limiting
4. Monitor performance and adjust batch sizes

### Current State Analysis
Your logs probably show something like:
```
[v0] "Support President Trump" - Processing 8 links (1 tracking): winred.com, actblue.com, secure.winred.com, ...
[v0] ✓ Resolved 1 tracking links to final destinations
```

This means only 1 of the 8 links matched the tracking pattern, so 7 were saved wrapped.

## Next Steps

1. Check your logs to confirm the pattern (look for "Processing X links (Y tracking)")
2. Decide which solution fits your needs:
   - Fast campaign creation but rely on unwrap-links cron? → Option 1
   - Slower but complete unwrapping upfront? → Option 2
   - Balanced approach? → Option 3
3. Implement chosen solution
4. Monitor performance impact
