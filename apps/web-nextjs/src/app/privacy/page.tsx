import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

export const metadata: Metadata = {
  title: "Privacy Policy | Ovalt",
  description: "How Ovalt collects, uses, and protects your data when you use our server-side GTM migration service.",
};

export default function PrivacyPolicy() {
  return (
    <div className="bg-[#131313] text-[#e5e2e1] min-h-screen">
      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-[#131313]/80 backdrop-blur-xl">
        <div className="flex justify-between items-center px-8 py-4 max-w-[1440px] mx-auto">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandLogo priority />
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/auth/login" className="text-white/70 text-sm label-font hover:text-white transition-colors duration-300">
              Sign In
            </Link>
            <Link href="/auth/register" className="bg-[#ff553c] text-white px-6 py-2.5 rounded-xl font-semibold label-font hover:brightness-110 transition-all">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-8">
          <div className="mb-12">
            <Link href="/" className="text-[#F63A22] label-font text-sm hover:underline mb-4 inline-block">
              ← Back to Home
            </Link>
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight headline-font leading-tight text-white mb-4">
              Privacy Policy
            </h1>
            <p className="text-[#e6bdb6] text-lg">Last updated: April 2, 2026</p>
          </div>

          <div className="space-y-8 text-[#e6bdb6]">
            <section>
              <h2 className="text-3xl font-bold text-white mb-4">1. Introduction</h2>
              <p className="leading-relaxed mb-4">
                Ovalt (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy
                explains how we collect, use, disclose, and safeguard your information when you use our service at ovalt.org
                (&quot;Service&quot;).
              </p>
              <p className="leading-relaxed">
                By using the Service, you consent to the data practices described in this policy.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">2. Information We Collect</h2>

              <h3 className="text-xl font-semibold text-white mb-3">2.1 Information You Provide</h3>
              <p className="leading-relaxed mb-4">We collect information that you directly provide to us:</p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li><strong className="text-white">Account Information:</strong> Name, email address, and organization details when you register</li>
                <li><strong className="text-white">OAuth Data:</strong> Profile information from Google or GitHub when you authenticate</li>
                <li><strong className="text-white">GTM Containers:</strong> Google Tag Manager container configurations you import</li>
                <li><strong className="text-white">Communication:</strong> Messages, feedback, or support requests you send to us</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3">2.2 Automatically Collected Information</h3>
              <p className="leading-relaxed mb-4">When you use the Service, we automatically collect:</p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li><strong className="text-white">Log Data:</strong> IP address, browser type, operating system, access times, and pages viewed</li>
                <li><strong className="text-white">Usage Data:</strong> Features used, actions taken, and migration runs performed</li>
                <li><strong className="text-white">Device Information:</strong> Device identifiers and characteristics</li>
                <li><strong className="text-white">Session Data:</strong> Authentication tokens and session metadata</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3">2.3 Google Tag Manager Data</h3>
              <p className="leading-relaxed mb-4">
                When you import GTM containers, we process:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Container configurations, tags, triggers, and variables</li>
                <li>GTM account and container metadata</li>
                <li>OAuth access tokens for GTM API access (stored encrypted)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">3. How We Use Your Information</h2>
              <p className="leading-relaxed mb-4">We use your information for the following purposes:</p>

              <h3 className="text-xl font-semibold text-white mb-3">3.1 Provide the Service</h3>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li>Process and migrate your GTM containers from client-side to server-side</li>
                <li>Generate migration plans and validation reports</li>
                <li>Store your migration history and artifacts</li>
                <li>Authenticate and authorize your access</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3">3.2 Improve the Service</h3>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li>Analyze usage patterns to enhance features</li>
                <li>Develop new migration rules and compatibility mappings</li>
                <li>Debug issues and improve reliability</li>
                <li>Train machine learning models for better tag classification</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3">3.3 Communication</h3>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li>Send service notifications and updates</li>
                <li>Respond to your inquiries and support requests</li>
                <li>Send security alerts and administrative messages</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3">3.4 Security and Compliance</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Detect and prevent fraud and abuse</li>
                <li>Comply with legal obligations</li>
                <li>Enforce our Terms of Service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">4. How We Share Your Information</h2>
              <p className="leading-relaxed mb-4">
                We do not sell your personal information. We may share your information in the following circumstances:
              </p>

              <h3 className="text-xl font-semibold text-white mb-3">4.1 Service Providers</h3>
              <p className="leading-relaxed mb-4">
                We share data with third-party service providers who perform services on our behalf:
              </p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li><strong className="text-white">Amazon Web Services (AWS):</strong> Infrastructure hosting, data storage (DynamoDB, S3), and compute (Lambda)</li>
                <li><strong className="text-white">Google Cloud Platform:</strong> OAuth authentication and GTM API access</li>
                <li><strong className="text-white">GitHub:</strong> OAuth authentication</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3">4.2 Legal Requirements</h3>
              <p className="leading-relaxed mb-4">
                We may disclose your information if required by law or in response to:
              </p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li>Valid legal processes (subpoenas, court orders)</li>
                <li>Government requests</li>
                <li>Protection of our rights, property, or safety</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3">4.3 Business Transfers</h3>
              <p className="leading-relaxed">
                If Ovalt is involved in a merger, acquisition, or sale of assets, your information may be transferred
                as part of that transaction. We will notify you via email or prominent notice on the Service.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">5. Data Storage and Security</h2>

              <h3 className="text-xl font-semibold text-white mb-3">5.1 Data Location</h3>
              <p className="leading-relaxed mb-4">
                Your data is stored in AWS data centers in the EU (eu-north-1 region) and US (us-east-1 for CloudFront).
              </p>

              <h3 className="text-xl font-semibold text-white mb-3">5.2 Security Measures</h3>
              <p className="leading-relaxed mb-4">
                We implement industry-standard security measures to protect your information:
              </p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li>Encryption in transit (TLS/HTTPS) and at rest (AWS encryption)</li>
                <li>Access controls and authentication (JWT tokens, OAuth)</li>
                <li>AWS Secrets Manager for sensitive credentials</li>
                <li>Regular security audits and monitoring</li>
                <li>Principle of least privilege for data access</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3">5.3 Data Retention</h3>
              <p className="leading-relaxed">
                We retain your information for as long as your account is active or as needed to provide the Service.
                You may request deletion of your data at any time. We may retain certain information for legal compliance
                or legitimate business purposes.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">6. Your Privacy Rights</h2>

              <h3 className="text-xl font-semibold text-white mb-3">6.1 Access and Correction</h3>
              <p className="leading-relaxed mb-4">
                You have the right to access and update your personal information through your account settings.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3">6.2 Data Portability</h3>
              <p className="leading-relaxed mb-4">
                You can export your GTM containers and migration data at any time through the Service.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3">6.3 Deletion</h3>
              <p className="leading-relaxed mb-4">
                You may request deletion of your account and associated data by contacting us at privacy@ovalt.org.
                We will delete your information within 30 days, subject to legal retention requirements.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3">6.4 GDPR Rights (EU Users)</h3>
              <p className="leading-relaxed mb-4">
                If you are in the European Economic Area, you have additional rights under GDPR:
              </p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li>Right to object to processing</li>
                <li>Right to restrict processing</li>
                <li>Right to lodge a complaint with a supervisory authority</li>
                <li>Right to withdraw consent at any time</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3">6.5 CCPA Rights (California Users)</h3>
              <p className="leading-relaxed mb-4">
                If you are a California resident, you have the right to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Know what personal information we collect and how it&apos;s used</li>
                <li>Request deletion of your personal information</li>
                <li>Opt-out of the sale of your personal information (we do not sell your data)</li>
                <li>Not be discriminated against for exercising your privacy rights</li>
              </ul>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">7. Cookies and Tracking</h2>
              <p className="leading-relaxed mb-4">
                We use cookies and similar tracking technologies to:
              </p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li><strong className="text-white">Essential Cookies:</strong> Required for authentication and security</li>
                <li><strong className="text-white">Functional Cookies:</strong> Remember your preferences and settings</li>
                <li><strong className="text-white">Analytics:</strong> Understand how you use the Service (aggregated, non-identifiable)</li>
              </ul>
              <p className="leading-relaxed">
                You can control cookies through your browser settings. Disabling essential cookies may affect Service functionality.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">8. Third-Party Links</h2>
              <p className="leading-relaxed">
                The Service may contain links to third-party websites (e.g., Google Tag Manager documentation).
                We are not responsible for the privacy practices of these third parties. We encourage you to read their
                privacy policies.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">9. Children&apos;s Privacy</h2>
              <p className="leading-relaxed">
                The Service is not intended for users under 18 years of age. We do not knowingly collect personal information
                from children. If you believe we have collected information from a child, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">10. International Data Transfers</h2>
              <p className="leading-relaxed">
                Your information may be transferred to and processed in countries other than your country of residence.
                These countries may have data protection laws that differ from your jurisdiction. We ensure appropriate
                safeguards are in place for such transfers in compliance with applicable laws.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">11. Changes to This Policy</h2>
              <p className="leading-relaxed mb-4">
                We may update this Privacy Policy from time to time. We will notify you of any material changes by:
              </p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li>Posting the updated policy on this page</li>
                <li>Updating the &quot;Last updated&quot; date</li>
                <li>Sending you an email notification (for significant changes)</li>
              </ul>
              <p className="leading-relaxed">
                Your continued use of the Service after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">12. Contact Us</h2>
              <p className="leading-relaxed mb-4">
                If you have questions about this Privacy Policy or wish to exercise your privacy rights, please contact us:
              </p>
              <div className="p-6 bg-[#20201f] rounded-xl border border-[#5d3f3a]/15 space-y-2">
                <p className="leading-relaxed">
                  <strong className="text-white">Email:</strong> privacy@ovalt.org
                </p>
                <p className="leading-relaxed">
                  <strong className="text-white">Data Protection:</strong> dpo@ovalt.org
                </p>
                <p className="leading-relaxed">
                  <strong className="text-white">Website:</strong> <Link href="/" className="text-[#F63A22] hover:underline">ovalt.org</Link>
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#0e0e0e] w-full py-16 px-8">
        <div className="max-w-[1440px] mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-white/20 text-xs uppercase tracking-widest">© 2024 Ovalt. All rights reserved.</p>
            <div className="flex items-center gap-8">
              <Link href="/privacy" className="text-white/40 text-sm hover:text-[#F63A22] transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="text-white/40 text-sm hover:text-[#F63A22] transition-colors">Terms of Service</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
