import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "About RIP Tool — Republican Inboxing Protocol",
  description:
    "RIP Tool is a political intelligence platform built for Republican campaigns, committees, and political organizations. Learn about our competitive intelligence, political email monitoring, and entity directory tools.",
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
          understand what the competition is sending, who is sending it, and
          where new campaigns are entering the fundraising ecosystem.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">What We Do</h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          Political email and text message fundraising has become one of the
          most important revenue channels for campaigns at every level — from
          local races to presidential campaigns. Staying informed about what
          competing campaigns and organizations are sending to their donors
          gives political professionals a meaningful strategic edge. RIP Tool
          was built to make that intelligence accessible, organized, and
          actionable.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          Our platform combines a real-time competitive intelligence feed, a
          comprehensive political communication directory, and personal
          monitoring tools into a single product. We monitor the sending
          activity of over 800 political entities and surface that data in a
          way that helps campaigns, committees, and consultants stay ahead.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-6">Platform Features</h2>

        <div className="space-y-8">
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
              RIP Tool tracks newly active political campaigns entering the
              fundraising ecosystem. The New Campaigns page surfaces candidates
              and committees that have recently begun sending political emails
              or SMS messages, giving clients early visibility into emerging
              political players before they appear in mainstream political
              coverage. Campaigns are organized by chamber, party, and state,
              and each entry links to a full entity profile.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">
              Personal Email and SMS Monitoring
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              RIP Tool clients can connect their own personal email addresses
              and phone numbers to the platform. The Personal Monitoring feature
              captures every political email and SMS message received by those
              accounts and attributes them to the correct sending entity, giving
              clients a first-person view of what their own voters and donors
              are receiving from competing campaigns and organizations.
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
          unlock full historical access, personal monitoring, and additional
          features. Enterprise pricing is available for organizations requiring
          custom configurations or expanded seat access.
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
          Understanding what competing campaigns are sending — the messaging
          strategies, subject line approaches, call-to-action tactics, and
          sending cadences they use — is increasingly important for campaigns
          that want to stay competitive. RIP Tool aggregates that activity into
          a single, searchable, filterable feed updated in real time.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          With over 800 tracked entities spanning federal candidates, state
          candidates, party committees, PACs, and political organizations, RIP
          Tool provides one of the most comprehensive views of Republican
          political communication activity available anywhere.
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
          . Articles cover topics including fundraising platform updates,
          compliance changes, and analysis of political email and SMS sending
          patterns across the Republican ecosystem.
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
