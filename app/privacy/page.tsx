import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy | RIP Tool",
  description:
    "Privacy Policy for RIP Tool (Republican Inboxing Protocol). Learn how we collect, use, and protect your personal information.",
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">RIP Tool Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">
          Effective Date: October 15, 2025 &nbsp;&mdash;&nbsp; Last Updated: October 15, 2025
        </p>

        <p className="mb-8 text-gray-700 leading-relaxed">
          Your privacy is important to us. This is RIP Tool&rsquo;s policy to respect your privacy and comply with
          applicable laws and regulations regarding any personal information we may collect about you when you use or
          visit rip-tool.com and related services (the &ldquo;Service&rdquo;). We are Republican Inboxing Protocol LLC,
          and references to &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo; mean Republican Inboxing Protocol
          LLC in its role as operator of RIP Tool.
        </p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">1. Information We Collect</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            We collect information in two main categories:
          </p>

          <h3 className="text-base font-semibold mb-2">Voluntarily Provided Information</h3>
          <p className="text-gray-700 leading-relaxed mb-3">
            This is information you knowingly and actively provide when using the Service, such as:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 leading-relaxed mb-6">
            <li>Name</li>
            <li>Email address</li>
            <li>Organization or company (if applicable)</li>
            <li>Any content, data, or files you upload or submit through the Service</li>
            <li>Contact or survey responses, support requests, or feedback</li>
          </ul>

          <h3 className="text-base font-semibold mb-2">Automatically Collected Information</h3>
          <p className="text-gray-700 leading-relaxed mb-3">
            When you visit or interact with our Service, our systems may automatically record information such as:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 leading-relaxed mb-4">
            <li>
              Log data: your IP address, browser type and version, pages visited, time stamps (date/time), time spent
              on pages, referring URL, error logs, etc.
            </li>
            <li>
              Device data: device type, operating system, unique device identifiers, settings, and possibly location
              data (depending on device settings)
            </li>
            <li>
              Usage data: how you interact with the Service, features you use, clicks, and other analytics
            </li>
            <li>
              Cookies and similar technologies: identifiers stored in your browser or on your device
            </li>
          </ul>
          <p className="text-gray-700 leading-relaxed">
            Though this data may not, by itself, personally identify you, it may be combined with other information to
            identify you.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">2. Sensitive / Special Categories of Data</h2>
          <p className="text-gray-700 leading-relaxed">
            &ldquo;Sensitive information&rdquo; (also called &ldquo;special categories of data&rdquo;) refers to data
            that deserves extra protection (e.g. race/ethnicity, political opinions, health data, biometric data,
            etc.). We will not collect sensitive information about you unless we first obtain your explicit consent, and
            only where permitted by law.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">3. User-Generated Content</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            If you submit content (such as text, images, or files) to the Service (&ldquo;User Content&rdquo;), note:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 leading-relaxed">
            <li>You retain whatever ownership rights you have in your content.</li>
            <li>
              By submitting User Content, you grant Republican Inboxing Protocol LLC a non-exclusive, royalty-free,
              worldwide, transferable, sub-licensable license to use, reproduce, distribute, display, prepare derivative
              works of, and perform that content in connection with operating the Service (including for marketing,
              promotional, or technical purposes).
            </li>
            <li>
              You may remove or delete your content or account, but any usage or caching that has already occurred may
              persist until removed.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">4. Purposes and Legal Basis for Processing Personal Information</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            We collect and use personal information only when we have a legitimate reason to do so. The types of
            processing and their purposes include:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 leading-relaxed">
            <li>To deliver, operate, and maintain our Service</li>
            <li>To provide you with customer support and respond to inquiries</li>
            <li>To communicate updates, promotional materials, and announcements (where allowed)</li>
            <li>
              To monitor performance, improve features, conduct analytics, and optimize user experience
            </li>
            <li>
              To detect, prevent, or investigate fraud, abuse, security breaches, or other prohibited uses
            </li>
            <li>
              To comply with legal obligations or requests from government or law enforcement authorities
            </li>
          </ul>
          <p className="text-gray-700 leading-relaxed mt-3">
            We may combine voluntarily provided and automatically collected information with external data from trusted
            sources (e.g. marketing, research) to gain insights and improve our Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">5. Sharing and Disclosure of Personal Information</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            We will not sell your personal information. We may share your information with:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 leading-relaxed mb-4">
            <li>
              <strong>Service Providers &amp; Vendors:</strong> Companies or individuals who perform functions on our
              behalf (e.g. hosting providers, analytics, payment processors, email delivery)
            </li>
            <li>
              <strong>Compliance &amp; Legal:</strong> When required by law or regulation, to comply with legal
              obligations, or to protect rights, property, or safety
            </li>
            <li>
              <strong>Business Transactions:</strong> In connection with a merger, acquisition, restructuring, sale, or
              in the event of sale of all or some of our assets
            </li>
            <li>
              <strong>Affiliates:</strong> Related entities under common ownership or control, as necessary to provide
              the Service
            </li>
            <li>
              <strong>Aggregated or De-identified Data:</strong> Data that has been anonymized or aggregated so it no
              longer identifies you individually
            </li>
          </ul>
          <p className="text-gray-700 leading-relaxed">
            We will limit third-party access to your personal information to only what is necessary for them to carry
            out their functions, and require them to protect your data according to reasonable security measures.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">6. Cookies, Tracking, and Similar Technologies</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            We use cookies and similar technologies (e.g. web beacons, local storage, pixel tags) for purposes
            including:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 leading-relaxed mb-4">
            <li>Enabling the functionality and operations of the Service</li>
            <li>Analytics and insights: understanding how the Service is used</li>
            <li>Personalization and user experience</li>
            <li>Security and fraud prevention</li>
          </ul>
          <p className="text-gray-700 leading-relaxed">
            You have control over cookies through your browser settings. Note that disabling or rejecting cookies may
            affect your ability to use certain features of the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">7. Data Retention</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            We retain your personal information only for as long as necessary to fulfill the purposes described in this
            Policy (or as required by law). After that, we will delete or anonymize your data (unless legal obligations
            require continued retention).
          </p>
          <p className="text-gray-700 leading-relaxed">
            If you close or delete your account, we may retain certain information as required for legal, accounting,
            or legitimate business purposes.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">8. Security of Your Data</h2>
          <p className="text-gray-700 leading-relaxed">
            We implement reasonable technical, administrative, and organizational safeguards to protect against
            unauthorized access, alteration, disclosure, or destruction of your personal information. However, no
            security system is perfect or impenetrable, and we cannot guarantee absolute security.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">9. Your Rights (Where Applicable)</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Depending on your jurisdiction, you may have rights such as:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 leading-relaxed mb-4">
            <li>
              <strong>Access:</strong> Request a copy of personal information we hold about you
            </li>
            <li>
              <strong>Correction / Update:</strong> Request we correct or update inaccurate or incomplete information
            </li>
            <li>
              <strong>Deletion / Erasure:</strong> Request we delete certain personal information (subject to legal
              exceptions)
            </li>
            <li>
              <strong>Restriction of Processing:</strong> Ask us to limit how we process your data
            </li>
            <li>
              <strong>Data Portability:</strong> Request that we provide your data in a portable, machine-readable
              format
            </li>
            <li>
              <strong>Objection / Opt-Out:</strong> Object to or withdraw consent for certain processing
            </li>
            <li>
              <strong>Consent Withdrawal:</strong> If processing is based on consent, you may withdraw consent at any
              time (without affecting prior processing)
            </li>
          </ul>
          <p className="text-gray-700 leading-relaxed">
            To exercise these rights, contact us at the email listed below. We may ask for identity verification before
            fulfilling requests. Some requests may be limited by legal or contractual obligations.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">10. Children&rsquo;s Privacy</h2>
          <p className="text-gray-700 leading-relaxed">
            Our Service is not intended for children under 13 (or other age required by applicable law). We do not
            knowingly collect personal information from children under that age. If we learn we have collected such
            data, we will promptly delete it.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">11. International Data Transfers</h2>
          <p className="text-gray-700 leading-relaxed">
            Given the nature of the Service, your data may be processed or stored in the United States or other
            countries with different privacy laws. By using the Service, you consent to such transfers, storage, and
            processing. We will take measures to ensure adequate protections (e.g. standard contractual clauses, data
            protection agreements) where required.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">12. Changes to This Privacy Policy</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            We may update this Privacy Policy from time to time. When we do, we will update the &ldquo;Last
            Updated&rdquo; date and post the revised version on this page. If the changes are material, we may provide
            more prominent notice (e.g. email) before they take effect.
          </p>
          <p className="text-gray-700 leading-relaxed">
            Your continued use of the Service after changes are posted constitutes acceptance of the updated Policy.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-3">13. Contact Us</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            If you have any questions, concerns, or requests regarding this Privacy Policy or your personal
            information, please contact:
          </p>
          <address className="not-italic text-gray-700 leading-relaxed">
            <strong>Republican Inboxing Protocol LLC (operating RIP Tool)</strong>
            <br />
            Email:{" "}
            <a href="mailto:privacy@rip-tool.com" className="text-blue-600 underline">
              privacy@rip-tool.com
            </a>
            <br />
            Address: 1209 Mountain Road Place Northeast, STE R, Albuquerque, New Mexico 87110
          </address>
        </section>

        <footer className="border-t pt-6 text-sm text-gray-500">
          &copy; 2025 Republican Inboxing Protocol LLC. All rights reserved.
        </footer>
      </div>
    </main>
  )
}
