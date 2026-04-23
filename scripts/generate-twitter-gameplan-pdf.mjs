// Script to generate the Twitter/X Automation Gameplan PDF
// Run with: node scripts/generate-twitter-gameplan-pdf.mjs

import { writeFileSync } from "fs"
import { mkdirSync } from "fs"

// We'll generate an HTML file and note it can be printed to PDF,
// OR we write raw PDF bytes. Let's use a simple HTML-to-PDF approach
// by writing a self-contained HTML file styled for print.

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Twitter/X Automation Gameplan — Inbox.GOP</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #1a1a1a;
      background: #fff;
      padding: 48px 56px;
      max-width: 820px;
      margin: 0 auto;
    }

    /* ---- Header ---- */
    .header {
      border-bottom: 3px solid #dc2626;
      padding-bottom: 20px;
      margin-bottom: 32px;
    }
    .header .eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #dc2626;
      margin-bottom: 6px;
    }
    .header h1 {
      font-size: 28px;
      font-weight: 800;
      color: #111;
      line-height: 1.2;
    }
    .header .subtitle {
      margin-top: 6px;
      font-size: 14px;
      color: #555;
    }
    .header .meta {
      margin-top: 12px;
      font-size: 12px;
      color: #888;
      display: flex;
      gap: 24px;
    }
    .header .meta span { display: flex; align-items: center; gap: 4px; }

    /* ---- Sections ---- */
    h2 {
      font-size: 17px;
      font-weight: 700;
      color: #111;
      margin-top: 36px;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e5e5e5;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    h2 .num {
      background: #dc2626;
      color: white;
      font-size: 11px;
      font-weight: 800;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    h3 {
      font-size: 14px;
      font-weight: 600;
      color: #222;
      margin-top: 18px;
      margin-bottom: 6px;
    }

    p { margin-bottom: 10px; color: #333; }

    ul, ol {
      padding-left: 20px;
      margin-bottom: 10px;
    }
    li { margin-bottom: 5px; color: #333; }
    li strong { color: #111; }

    /* ---- Callout boxes ---- */
    .callout {
      background: #fef2f2;
      border-left: 4px solid #dc2626;
      padding: 14px 16px;
      border-radius: 0 6px 6px 0;
      margin: 16px 0;
    }
    .callout.green {
      background: #f0fdf4;
      border-left-color: #16a34a;
    }
    .callout.blue {
      background: #eff6ff;
      border-left-color: #2563eb;
    }
    .callout.yellow {
      background: #fffbeb;
      border-left-color: #d97706;
    }
    .callout p { margin-bottom: 0; }
    .callout .label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 4px;
      color: #dc2626;
    }
    .callout.green .label { color: #16a34a; }
    .callout.blue .label { color: #2563eb; }
    .callout.yellow .label { color: #d97706; }

    /* ---- Tables ---- */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 16px;
      font-size: 13px;
    }
    th {
      background: #f5f5f5;
      font-weight: 600;
      text-align: left;
      padding: 8px 12px;
      border: 1px solid #e5e5e5;
      color: #333;
      font-size: 12px;
    }
    td {
      padding: 8px 12px;
      border: 1px solid #e5e5e5;
      vertical-align: top;
    }
    tr:nth-child(even) td { background: #fafafa; }

    /* ---- Code ---- */
    code {
      background: #f4f4f5;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      font-family: 'Courier New', monospace;
      color: #dc2626;
    }
    .code-block {
      background: #18181b;
      color: #e4e4e7;
      padding: 14px 18px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.7;
      margin: 12px 0;
      overflow-x: auto;
    }
    .code-block .comment { color: #71717a; }
    .code-block .key { color: #60a5fa; }
    .code-block .val { color: #34d399; }
    .code-block .str { color: #fbbf24; }

    /* ---- Timeline ---- */
    .timeline { margin: 16px 0; }
    .timeline-item {
      display: flex;
      gap: 14px;
      margin-bottom: 16px;
    }
    .timeline-dot {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #dc2626;
      color: white;
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .timeline-dot.done { background: #16a34a; }
    .timeline-dot.pending { background: #d1d5db; color: #555; }
    .timeline-content h4 {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 2px;
    }
    .timeline-content p {
      font-size: 13px;
      color: #555;
      margin-bottom: 0;
    }

    /* ---- Pills ---- */
    .pills { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
    .pill {
      background: #f4f4f5;
      border: 1px solid #e5e5e5;
      padding: 3px 10px;
      border-radius: 99px;
      font-size: 12px;
      font-weight: 500;
      color: #333;
    }
    .pill.red { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }
    .pill.green { background: #f0fdf4; border-color: #86efac; color: #16a34a; }
    .pill.blue { background: #eff6ff; border-color: #93c5fd; color: #2563eb; }

    /* ---- Footer ---- */
    .footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid #e5e5e5;
      font-size: 11px;
      color: #aaa;
      display: flex;
      justify-content: space-between;
    }

    /* ---- Print ---- */
    @media print {
      body { padding: 24px 32px; }
      h2 { page-break-after: avoid; }
      .callout { page-break-inside: avoid; }
      table { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="eyebrow">Inbox.GOP — Internal Gameplan</div>
    <h1>Twitter/X Daily Post Automation</h1>
    <div class="subtitle">Automated daily posts from email/SMS archive to drive site traffic and ad revenue</div>
    <div class="meta">
      <span>Status: Pending (awaiting Twitter API + AdSense approval)</span>
      <span>Version: 1.0</span>
    </div>
  </div>

  <!-- Overview -->
  <h2><span class="num">0</span> Overview</h2>
  <p>
    Once Twitter API credentials are approved and Google AdSense is live on public share pages,
    this system will automatically post one email or SMS from the archive to the
    <strong>@InboxGOP</strong> (or equivalent) Twitter/X account every day. The post links to a
    public share token URL on our site, driving traffic to ad-monetized pages.
  </p>
  <div class="callout blue">
    <div class="label">Why this matters</div>
    <p>
      Every post is essentially a free ad impression funnel: Twitter user sees post &rarr; clicks link &rarr;
      lands on public share page &rarr; sees Google Ads &rarr; revenue. Organic reach compounds over time
      as followers grow.
    </p>
  </div>

  <!-- Prerequisites -->
  <h2><span class="num">1</span> Prerequisites (Blockers)</h2>
  <p>Nothing below can be built or deployed until these are in place:</p>

  <div class="timeline">
    <div class="timeline-item">
      <div class="timeline-dot pending">A</div>
      <div class="timeline-content">
        <h4>Twitter/X Developer Account + API v2 Access</h4>
        <p>Apply at developer.twitter.com. Free tier (Basic, $100/mo) allows up to 1,500 tweets/month — well within 1/day. Need: API Key, API Secret, Access Token, Access Token Secret, and a connected app with Read+Write permissions.</p>
      </div>
    </div>
    <div class="timeline-item">
      <div class="timeline-dot pending">B</div>
      <div class="timeline-content">
        <h4>Google AdSense Approval on Share Pages</h4>
        <p>The public share token pages (<code>/share/[token]</code>) need to exist, be crawlable, and have meaningful content before AdSense will approve them. The SSR work already done on /directory and /news pages directly supports this.</p>
      </div>
    </div>
    <div class="timeline-item">
      <div class="timeline-dot pending">C</div>
      <div class="timeline-content">
        <h4>Share Token System Built</h4>
        <p>Each email/SMS needs a shareable public URL (<code>/share/abc123</code>) that shows a read-only view of the message with full SSR content. This is needed both for the Twitter link and for AdSense placement.</p>
      </div>
    </div>
  </div>

  <!-- Content Strategy -->
  <h2><span class="num">2</span> Content Strategy</h2>

  <h3>What Gets Posted</h3>
  <ul>
    <li><strong>Source:</strong> Email campaigns and SMS messages from the last 24 hours, filtered to candidates only (not PACs or generic orgs — candidates have profile pictures, bios, and Ballotpedia summaries which makes the linked page richer)</li>
    <li><strong>Frequency:</strong> 1 post per day, posted at a consistent time (recommended: 11am Eastern)</li>
    <li><strong>No repeats:</strong> A <code>twitterPostedAt</code> flag on each record prevents re-posting</li>
    <li><strong>Random selection:</strong> From the eligible pool (sent in last 24h, not yet posted, candidate entity type), one is chosen at random</li>
  </ul>

  <h3>Caption Format</h3>
  <p>The tweet text is auto-generated. Examples based on type:</p>

  <table>
    <thead>
      <tr><th>Type</th><th>Caption Template</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>Email</td>
        <td>&#x1F6A8; See what [Name] just sent to supporters &rarr; [share URL] #GOP #Politics</td>
      </tr>
      <tr>
        <td>Email (fundraising)</td>
        <td>&#x1F4B0; [Name] is asking for money. See exactly what they said &rarr; [share URL]</td>
      </tr>
      <tr>
        <td>SMS</td>
        <td>&#x1F4F2; [Name] just texted supporters. Here&apos;s what they said &rarr; [share URL]</td>
      </tr>
      <tr>
        <td>Fallback</td>
        <td>&#x1F440; [Name] campaign message just dropped &rarr; [share URL] #InboxGOP</td>
      </tr>
    </tbody>
  </table>

  <div class="callout yellow">
    <div class="label">Caption Note</div>
    <p>Twitter has a 280 character limit. Entity name + share URL + hashtags must fit. The share URL will be shortened by Twitter automatically (t.co), so the raw URL length does not count against the limit.</p>
  </div>

  <!-- Technical Architecture -->
  <h2><span class="num">3</span> Technical Architecture</h2>

  <h3>Database Changes Required</h3>
  <p>Two new columns needed on both <code>Campaign</code> (emails) and <code>SmsMessage</code> tables:</p>

  <table>
    <thead>
      <tr><th>Column</th><th>Type</th><th>Default</th><th>Purpose</th></tr>
    </thead>
    <tbody>
      <tr><td><code>twitterPostedAt</code></td><td>DateTime?</td><td>null</td><td>Timestamp of when it was posted; null = not yet posted</td></tr>
    </tbody>
  </table>

  <p>The share token column (<code>shareToken</code>) is also needed on both tables — this may already be in progress as part of the share feature.</p>

  <h3>New API Route: Cron Handler</h3>
  <div class="code-block">
    <span class="comment">// app/api/cron/twitter-post/route.ts</span><br/>
    <span class="comment">// Called by Vercel Cron at 11:00 ET daily</span><br/><br/>
    <span class="key">GET</span> <span class="str">/api/cron/twitter-post</span><br/>
    &nbsp;&nbsp;<span class="comment">1. Verify CRON_SECRET header (security)</span><br/>
    &nbsp;&nbsp;<span class="comment">2. Query eligible messages (sent in last 24h, twitterPostedAt = null, entity.type = "candidate")</span><br/>
    &nbsp;&nbsp;<span class="comment">3. Pick one at random from the pool</span><br/>
    &nbsp;&nbsp;<span class="comment">4. Generate caption string</span><br/>
    &nbsp;&nbsp;<span class="comment">5. POST to Twitter API v2 /tweets</span><br/>
    &nbsp;&nbsp;<span class="comment">6. On success: set twitterPostedAt = now on the record</span><br/>
    &nbsp;&nbsp;<span class="comment">7. Return 200 with tweetId + selected message summary</span>
  </div>

  <h3>Vercel Cron Configuration</h3>
  <div class="code-block">
    <span class="comment">// vercel.json</span><br/>
    {<br/>
    &nbsp;&nbsp;<span class="key">"crons"</span>: [{<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"path"</span>: <span class="str">"/api/cron/twitter-post"</span>,<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"schedule"</span>: <span class="str">"0 16 * * *"</span> <span class="comment">// 11am ET = 4pm UTC</span><br/>
    &nbsp;&nbsp;}]<br/>
    }
  </div>

  <h3>Environment Variables Required</h3>
  <table>
    <thead>
      <tr><th>Variable</th><th>Source</th></tr>
    </thead>
    <tbody>
      <tr><td><code>TWITTER_API_KEY</code></td><td>Twitter Developer Portal</td></tr>
      <tr><td><code>TWITTER_API_SECRET</code></td><td>Twitter Developer Portal</td></tr>
      <tr><td><code>TWITTER_ACCESS_TOKEN</code></td><td>Twitter Developer Portal</td></tr>
      <tr><td><code>TWITTER_ACCESS_TOKEN_SECRET</code></td><td>Twitter Developer Portal</td></tr>
      <tr><td><code>CRON_SECRET</code></td><td>Generate a random string, add to Vercel + vercel.json</td></tr>
    </tbody>
  </table>

  <!-- Share Pages + Ads -->
  <h2><span class="num">4</span> Share Pages + Ad Revenue</h2>

  <h3>How Share Pages Work</h3>
  <p>
    When an email or SMS is selected for posting, it needs a public URL. The share system generates a
    random token (e.g. <code>abc123xyz</code>) stored in the database, producing a URL like:
  </p>
  <div class="code-block">
    https://app.rip-tool.com/share/abc123xyz
  </div>
  <p>
    This page renders the full message content — subject, body, sender, date, entity name/photo —
    as SSR HTML. No login required. This is what gets posted to Twitter and what crawlers/AdSense sees.
  </p>

  <div class="callout green">
    <div class="label">Ad Revenue Potential</div>
    <p>
      Share pages are fully public, SSR-rendered, and contain unique high-value political content —
      exactly what AdSense rewards. A viral tweet about a major candidate could drive thousands of
      visits to a single share page in 24 hours. At even a $2 RPM (conservative for political content),
      10,000 visits = $20 per post. Political ad RPMs can spike to $10–30 during election cycles.
    </p>
  </div>

  <h3>Ad Placement on Share Pages</h3>
  <ul>
    <li>Banner ad above the message content</li>
    <li>In-content ad between the message header and body</li>
    <li>Sticky footer ad on mobile</li>
    <li>Sidebar ad on desktop with related entity profile links (also drives directory traffic)</li>
  </ul>

  <!-- Build Order -->
  <h2><span class="num">5</span> Recommended Build Order</h2>

  <div class="timeline">
    <div class="timeline-item">
      <div class="timeline-dot">1</div>
      <div class="timeline-content">
        <h4>Build Share Token System</h4>
        <p>Generate share tokens, create /share/[token] public SSR pages, add shareToken column to Campaign + SmsMessage. This is needed first and independently useful (share buttons in the app).</p>
      </div>
    </div>
    <div class="timeline-item">
      <div class="timeline-dot">2</div>
      <div class="timeline-content">
        <h4>Add Ad Slots to Share Pages</h4>
        <p>Once AdSense is approved, place ad units. SSR content on share pages satisfies AdSense content requirements better than gated pages.</p>
      </div>
    </div>
    <div class="timeline-item">
      <div class="timeline-dot">3</div>
      <div class="timeline-content">
        <h4>Add twitterPostedAt to Schema + Run Migration</h4>
        <p>Small Prisma migration. No UI changes needed.</p>
      </div>
    </div>
    <div class="timeline-item">
      <div class="timeline-dot">4</div>
      <div class="timeline-content">
        <h4>Build Cron Route + Twitter Integration</h4>
        <p>Wire up /api/cron/twitter-post with Twitter API v2, caption generation, and DB update. Add vercel.json cron config.</p>
      </div>
    </div>
    <div class="timeline-item">
      <div class="timeline-dot">5</div>
      <div class="timeline-content">
        <h4>Test + Monitor</h4>
        <p>Trigger the cron manually first. Add admin notifications (email to kevinalyk@gmail.com) when a post goes out, including which message was posted and the tweet URL.</p>
      </div>
    </div>
  </div>

  <!-- Open Questions -->
  <h2><span class="num">6</span> Open Questions / Decisions</h2>

  <table>
    <thead>
      <tr><th>Question</th><th>Options</th><th>Recommendation</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>What happens if no eligible messages in last 24h?</td>
        <td>Skip day, or extend window to 48h</td>
        <td>Skip day — better than re-posting</td>
      </tr>
      <tr>
        <td>Should fallback to SMS if no emails?</td>
        <td>Email-only, or email + SMS pool</td>
        <td>Both in the pool — more variety</td>
      </tr>
      <tr>
        <td>Hashtag strategy</td>
        <td>Generic (#GOP), entity-specific (#TomEmmer), or none</td>
        <td>Mix: #InboxGOP always + entity name hashtag</td>
      </tr>
      <tr>
        <td>What if Twitter API post fails?</td>
        <td>Retry, or skip and alert</td>
        <td>Alert via email (same Mailgun system) + skip</td>
      </tr>
      <tr>
        <td>Post volume increase over time?</td>
        <td>1/day forever, or ramp up to 2-3/day</td>
        <td>Start at 1/day, revisit after 30 days of data</td>
      </tr>
    </tbody>
  </table>

  <!-- Footer -->
  <div class="footer">
    <span>Inbox.GOP — Internal Document</span>
    <span>Twitter/X Automation Gameplan v1.0</span>
  </div>

</body>
</html>`

// Ensure docs directory exists
mkdirSync("docs", { recursive: true })

// Write the HTML file (can be printed to PDF from browser)
writeFileSync("docs/twitter-automation-gameplan.html", html)
console.log("Written: docs/twitter-automation-gameplan.html")
console.log("Open this file in a browser and use File > Print > Save as PDF")
