import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "About RIP Tool — Republican Inboxing Protocol",
  description:
    "RIP Tool is a political intelligence platform built for Republican campaigns, committees, and political organizations. Learn about our inbox placement tracking, competitive intelligence, and political email monitoring tools.",
  robots: { index: true, follow: true },
}

export default function AboutPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-foreground">
      <header className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          About RIP Tool
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed">
          RIP Tool — Republican Inboxing Protocol — is a political intelligence
          platform built specifically for Republican campaigns, party committees,
          PACs, and political organizations. We help political professionals
          understand what is being sent, where it lands, and what the
          competition is doing.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">What We Do</h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          Political email and text message fundraising has become one of the
          most important revenue channels for campaigns at every level — from
          local races to presidential campaigns. The difference between an email
          landing in the inbox versus the spam folder can represent hundreds of
          thousands of dollars in a single fundraising cycle. RIP Tool was built
          to give Republican political professionals the data they need to
          compete effectively.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          Our platform combines inbox placement monitoring, competitive
          intelligence, and a comprehensive political communication directory
          into a single tool. We track email delivery across seed accounts,
          monitor the sending activity of over 800 political entities, and
          surface actionable intelligence for campaigns that need to stay ahead.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-6">Platform Features</h2>

        <div className="space-y-8">
          <div>
            <h3 className="text-lg font-semibold mb-2">
              Inbox Placement Monitoring
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              RIP Tool monitors email deliverability by tracking campaign sends
              against a managed seed list. Every time a client sends a campaign,
              RIP Tool measures whether the email lands in the inbox or the spam
              folder across major email providers. Clients can view their inbox
              rate, spam rate, and overall delivery rate for each campaign, with
              historical trend data going back up to one year. The platform
              breaks down deliverability by date range, state, party, donation
              platform (WinRed, ActBlue, Anedot, PSQ), and file type (house
              file versus third-party), giving campaign managers and digital
              directors a granular view of where their emails are going and why.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">
              Competitive Intelligence Feed
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              The Competitive Intelligence feed is a real-time stream of
              political emails and SMS messages captured from across the
              Republican fundraising ecosystem. Clients with a Competitive
              Intelligence subscription can browse, search, filter, and preview
              every email and text message captured by the platform — including
              the full HTML content of emails, subject lines, sender
              information, and all call-to-action links. The feed can be
              filtered by entity, party, state, message type, date range,
              sender domain, and file type classification. Clients can share
              individual messages via a unique share link for team collaboration.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">
              Political Entity Directory
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              RIP Tool maintains a comprehensive public directory of over 800
              political entities — including candidates for U.S. Senate, U.S.
              House, governor, and other offices, as well as PACs, party
              committees, nonprofits, and political organizations. Each entity
              profile includes the entity's party affiliation, state, office
              type, known sending domains, known SMS short codes and phone
              numbers, WinRed and ActBlue donation identifiers, a Ballotpedia
              biography, and a historical record of emails and text messages
              sent by that entity. The directory is searchable and filterable by
              party, state, and entity type, and is publicly accessible at
              app.rip-tool.com/directory.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">
              New Campaigns Directory
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              RIP Tool tracks newly filed and newly active political campaigns
              entering the fundraising ecosystem. The New Campaigns page
              surfaces candidates and committees that have recently begun
              sending political emails or SMS messages, giving clients early
              visibility into emerging political players before they appear in
              mainstream political coverage.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">
              Personal Email and SMS Monitoring
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Beyond the platform-wide seed list, RIP Tool clients can connect
              their own personal email addresses and phone numbers to the
              platform. The Personal Monitoring feature captures every political
              email and SMS message received by those accounts and attributes
              them to the correct sending entity, giving clients a first-person
              view of what their own voters and donors are receiving from
              competing campaigns and organizations.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">
              Inboxing Trends and Analytics
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              The Inboxing Report provides paid-tier clients with charts and
              analytics covering inbox rate over time, spam rate trends, overall
              deliverability, inbox rate by party, inbox rate by donation
              platform, and inbox rate by file type. Reports can be filtered by
              time period (7 days, 30 days, 90 days, one year, or custom date
              range) and by state, allowing political professionals to compare
              deliverability across regions and platforms and identify
              deliverability issues before they impact fundraising performance.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">
              Sender Domain and Short Code Tracking
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Every entity in the RIP Tool directory is mapped to its known
              sending infrastructure — including email sending domains, from
              addresses, SMS short codes, long codes, and donation platform
              identifiers. When a new message arrives from an unrecognized
              sender, RIP Tool automatically attempts to match it to a known
              entity using domain matching, short code matching, and donation
              link analysis. Unmatched messages are surfaced for manual review
              and assignment.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">
              Compliance and Name Redaction
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              RIP Tool includes built-in compliance tools to help clients manage
              their seed list data responsibly. The platform supports name
              redaction across captured message content, blocked domain
              management to exclude known transactional senders from the
              competitive intelligence feed, and compliance logging for
              reporting purposes.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">
              API Access
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Clients on eligible plans can access RIP Tool data programmatically
              via a REST API using API key authentication. The Developer section
              of the platform allows clients to generate and manage API keys for
              integration with their own internal tools and workflows.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Who Uses RIP Tool</h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          RIP Tool is used by Republican political campaigns, national and state
          party committees, PACs, super PACs, political consultants, digital
          fundraising firms, and research organizations. The platform is designed
          for professionals who manage political email and SMS programs and need
          reliable, timely intelligence on the competitive landscape.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          The platform is subscription-based. A free tier is available with
          limited access to recent competitive intelligence data. Paid tiers
          unlock full historical access, inboxing reports, personal monitoring,
          and API access. Enterprise pricing is available for organizations
          requiring custom configurations or expanded seat access.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">The Political Email Landscape</h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          Political email fundraising in the United States has grown into a
          multi-billion dollar industry. Campaigns at every level rely on email
          and SMS programs to reach donors, mobilize volunteers, and communicate
          with supporters. The Republican fundraising ecosystem includes
          thousands of active campaigns and committees sending hundreds of
          millions of emails and text messages each election cycle.
        </p>
        <p className="text-muted-foreground leading-relaxed mb-4">
          Inbox placement — whether an email lands in a recipient's primary
          inbox, promotional tab, or spam folder — directly determines how many
          people see a campaign's message and how much money that message raises.
          Gmail, Outlook, Yahoo, and other major email providers use increasingly
          sophisticated filters that evaluate sender reputation, engagement
          history, authentication records, and content signals to make placement
          decisions. A campaign that consistently lands in spam can lose a
          significant portion of its fundraising capacity without ever knowing
          the cause.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          RIP Tool was built to bring transparency to this process — giving
          Republican political professionals a tool to monitor their own
          deliverability, benchmark against the broader ecosystem, and stay
          informed about what competing campaigns and organizations are sending
          to their donors.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">News and Updates</h2>
        <p className="text-muted-foreground leading-relaxed">
          RIP Tool publishes regular updates on platform changes, new features,
          political email industry trends, and research findings at{" "}
          <a
            href="/news"
            className="underline underline-offset-4 hover:text-foreground transition-colors"
          >
            app.rip-tool.com/news
          </a>
          . Articles cover topics including Gmail inbox placement trends,
          fundraising platform updates, compliance changes, and analysis of
          political email sending patterns across the Republican ecosystem.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Access and Availability</h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          RIP Tool is available to qualified political campaigns, committees, and
          organizations. The platform operates at{" "}
          <a
            href="https://app.rip-tool.com"
            className="underline underline-offset-4 hover:text-foreground transition-colors"
          >
            app.rip-tool.com
          </a>{" "}
          and requires account registration. The political entity directory and
          news section are publicly accessible without registration.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          For information about pricing and access, visit the sign-up page or
          contact the RIP Tool team directly. The platform is maintained and
          operated by the Republican Inboxing Protocol team.
        </p>
      </section>

      <footer className="border-t pt-8">
        <address className="not-italic text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">RIP Tool — Republican Inboxing Protocol</p>
          <p>
            <a
              href="https://app.rip-tool.com"
              className="hover:text-foreground transition-colors"
            >
              app.rip-tool.com
            </a>
          </p>
          <p>
            <a
              href="/privacy"
              className="hover:text-foreground transition-colors"
            >
              Privacy Policy
            </a>
            {" · "}
            <a
              href="/terms"
              className="hover:text-foreground transition-colors"
            >
              Terms of Service
            </a>
          </p>
        </address>
      </footer>
    </main>
  )
}
