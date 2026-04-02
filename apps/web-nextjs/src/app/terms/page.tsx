import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Terms of Service | Ovalt",
  description: "Terms governing your use of the Ovalt platform for Google Tag Manager server-side migration.",
};

export default function TermsOfService() {
  return (
    <div className="bg-[#131313] text-[#e5e2e1] min-h-screen">
      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-[#131313]/80 backdrop-blur-xl">
        <div className="flex justify-between items-center px-8 py-4 max-w-[1440px] mx-auto">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Ovalt" width={140} height={32} unoptimized className="h-8 w-auto" priority />
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
              Terms of Service
            </h1>
            <p className="text-[#e6bdb6] text-lg">Last updated: April 2, 2026</p>
          </div>

          <div className="space-y-8 text-[#e6bdb6]">
            <section>
              <h2 className="text-3xl font-bold text-white mb-4">1. Acceptance of Terms</h2>
              <p className="leading-relaxed mb-4">
                By accessing or using Ovalt (&quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;).
                If you do not agree to these Terms, do not use the Service.
              </p>
              <p className="leading-relaxed">
                Ovalt provides a platform for migrating Google Tag Manager containers from client-side to server-side
                implementations. These Terms apply to all users of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">2. Use of Service</h2>
              <h3 className="text-xl font-semibold text-white mb-3">2.1 Eligibility</h3>
              <p className="leading-relaxed mb-4">
                You must be at least 18 years old to use the Service. By using the Service, you represent and warrant that
                you meet this requirement.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3">2.2 Account Registration</h3>
              <p className="leading-relaxed mb-4">
                To use certain features of the Service, you must register for an account. You agree to:
              </p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li>Provide accurate, current, and complete information</li>
                <li>Maintain and promptly update your account information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Notify us immediately of any unauthorized use of your account</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3">2.3 Acceptable Use</h3>
              <p className="leading-relaxed mb-4">
                You agree not to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Use the Service for any illegal or unauthorized purpose</li>
                <li>Violate any laws in your jurisdiction</li>
                <li>Infringe or violate the intellectual property rights of others</li>
                <li>Transmit any malicious code, viruses, or harmful data</li>
                <li>Attempt to gain unauthorized access to any part of the Service</li>
                <li>Interfere with or disrupt the integrity or performance of the Service</li>
                <li>Use the Service to compete with Ovalt or build a similar product</li>
              </ul>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">3. Your Data</h2>
              <h3 className="text-xl font-semibold text-white mb-3">3.1 Ownership</h3>
              <p className="leading-relaxed mb-4">
                You retain all rights, title, and interest in your Google Tag Manager containers, configurations, and data
                (&quot;Your Data&quot;). Ovalt claims no ownership rights over Your Data.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3">3.2 License to Process</h3>
              <p className="leading-relaxed mb-4">
                By using the Service, you grant Ovalt a limited, non-exclusive license to access, process, and analyze
                Your Data solely for the purpose of providing the migration services and improving the Service.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3">3.3 Data Security</h3>
              <p className="leading-relaxed">
                We implement reasonable security measures to protect Your Data. However, no method of transmission or storage
                is 100% secure. You acknowledge that you provide Your Data at your own risk.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">4. Service Availability</h2>
              <p className="leading-relaxed mb-4">
                We strive to maintain high availability of the Service but do not guarantee that the Service will be
                uninterrupted, timely, secure, or error-free. We reserve the right to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Modify or discontinue the Service (or any part thereof) at any time</li>
                <li>Perform scheduled or emergency maintenance</li>
                <li>Implement usage limits or restrictions</li>
              </ul>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">5. Intellectual Property</h2>
              <p className="leading-relaxed mb-4">
                The Service, including all content, features, functionality, software, and design, is owned by Ovalt
                and is protected by copyright, trademark, and other intellectual property laws.
              </p>
              <p className="leading-relaxed">
                You may not copy, modify, distribute, sell, or lease any part of the Service without our prior written consent.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">6. Third-Party Services</h2>
              <p className="leading-relaxed mb-4">
                The Service integrates with third-party services, including:
              </p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li>Google Tag Manager and Google Cloud Platform</li>
                <li>Amazon Web Services (AWS)</li>
                <li>OAuth authentication providers (Google, GitHub)</li>
              </ul>
              <p className="leading-relaxed">
                Your use of these third-party services is subject to their respective terms of service and privacy policies.
                We are not responsible for any third-party services.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">7. Payment and Billing</h2>
              <h3 className="text-xl font-semibold text-white mb-3">7.1 Fees</h3>
              <p className="leading-relaxed mb-4">
                Certain features of the Service may require payment. You agree to pay all applicable fees as described
                on our pricing page.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3">7.2 AWS Costs</h3>
              <p className="leading-relaxed mb-4">
                When deploying to AWS, you are responsible for all AWS infrastructure costs incurred. Ovalt is not
                responsible for AWS charges.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3">7.3 Refunds</h3>
              <p className="leading-relaxed">
                All fees are non-refundable unless otherwise stated in writing or required by law.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">8. Disclaimer of Warranties</h2>
              <p className="leading-relaxed mb-4">
                THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS
                OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
                OR NON-INFRINGEMENT.
              </p>
              <p className="leading-relaxed">
                WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT ANY MIGRATION WILL BE SUCCESSFUL
                OR ACCURATE. YOU USE THE SERVICE AT YOUR OWN RISK.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">9. Limitation of Liability</h2>
              <p className="leading-relaxed mb-4">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, OVALT SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
                CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY,
                OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
              </p>
              <p className="leading-relaxed">
                IN NO EVENT SHALL OVALT&apos;S TOTAL LIABILITY EXCEED THE AMOUNT YOU PAID TO OVALT IN THE TWELVE (12)
                MONTHS PRECEDING THE CLAIM.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">10. Indemnification</h2>
              <p className="leading-relaxed">
                You agree to indemnify and hold harmless Ovalt from any claims, damages, losses, liabilities, and expenses
                (including legal fees) arising out of your use of the Service, violation of these Terms, or infringement of any
                third-party rights.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">11. Termination</h2>
              <p className="leading-relaxed mb-4">
                We may terminate or suspend your account and access to the Service at any time, with or without cause,
                with or without notice.
              </p>
              <p className="leading-relaxed">
                Upon termination, your right to use the Service will immediately cease. We may delete Your Data after a
                reasonable period following termination.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">12. Changes to Terms</h2>
              <p className="leading-relaxed mb-4">
                We reserve the right to modify these Terms at any time. We will notify you of material changes by posting
                the updated Terms on this page and updating the &quot;Last updated&quot; date.
              </p>
              <p className="leading-relaxed">
                Your continued use of the Service after any changes constitutes acceptance of the new Terms.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">13. Governing Law</h2>
              <p className="leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which
                Ovalt operates, without regard to conflict of law principles.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-white mb-4">14. Contact</h2>
              <p className="leading-relaxed">
                If you have any questions about these Terms, please contact us at:
              </p>
              <p className="leading-relaxed mt-4 p-6 bg-[#20201f] rounded-xl border border-[#5d3f3a]/15">
                Email: legal@ovalt.org<br/>
                Website: <Link href="/" className="text-[#F63A22] hover:underline">ovalt.org</Link>
              </p>
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
