'use client';

import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/lib/auth-context";
import UserMenu from "@/components/UserMenu";

export default function Home() {
  const { user, isLoading } = useAuth();
  return (
    <div className="bg-[#131313] text-[#e5e2e1] min-h-screen">
      {/* TopNavBar */}
      <nav className="fixed top-0 z-50 w-full border-b border-white/[0.06] bg-[#131313]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandLogo priority />
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a className="text-sm font-medium text-[#41ffaf]" href="#product">
              Product
            </a>
            <a className="text-sm font-medium text-zinc-400 transition-colors hover:text-white" href="#features">
              Features
            </a>
            <Link href="/pricing" className="text-sm font-medium text-zinc-400 transition-colors hover:text-white">
              Pricing
            </Link>
            <Link href="/dashboard" className="text-sm font-medium text-zinc-400 transition-colors hover:text-white">
              Dashboard
            </Link>
          </div>
          <div className="flex items-center gap-6">
            {isLoading ? (
              <div className="w-32 h-10 bg-[#353535] rounded-xl animate-pulse"></div>
            ) : user ? (
              <UserMenu />
            ) : (
              <>
                <Link href="/auth/login" className="text-sm font-medium text-zinc-400 transition-colors hover:text-white">
                  Sign in
                </Link>
                <Link
                  href="/auth/register"
                  className="rounded-full bg-[#41ffaf] px-5 py-2.5 text-sm font-semibold text-[#003822] transition-opacity hover:opacity-90"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-28 md:pt-32">
        {/* Hero Section */}
        <section className="mx-auto mb-28 max-w-7xl px-5 sm:px-6 lg:mb-40 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 bg-[#20201f] rounded-full border border-[#5d3f3a]/15">
                <span className="w-2 h-2 rounded-full bg-[#5fde8f]"></span>
                <span className="label-font text-[10px] uppercase tracking-widest text-[#5fde8f]">Production Ready</span>
              </div>
              <h1 className="mb-8 text-5xl font-semibold tracking-tight headline-font text-white md:text-7xl md:leading-[1.05]">
                Move your GTM to the <span className="text-[#41ffaf]">server</span>
                <span className="text-zinc-500"> — </span>without a developer.
              </h1>
              <p className="mb-10 max-w-xl text-lg leading-relaxed text-zinc-400 md:text-xl">
                Convert client-side containers into enterprise-grade server-side infrastructure in minutes. Privacy-first
                tracking, minimal engineering lift.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#41ffaf] px-8 py-4 text-base font-semibold text-[#003822] transition-opacity hover:opacity-90"
                >
                  Import your container
                  <span className="material-symbols-outlined text-xl">arrow_forward</span>
                </Link>
                <Link
                  href="#demo"
                  className="inline-flex items-center justify-center rounded-full border border-white/15 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-white/5"
                >
                  View live demo
                </Link>
              </div>
            </div>
            <div className="lg:col-span-5 relative">
              <div className="relative z-10 p-4 rounded-lg bg-[#20201f] border border-white/10 shadow-2xl">
                <div className="aspect-square rounded overflow-hidden bg-[#1c1b1b] flex items-center justify-center relative group">
                  <img
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBSnBayGsfdU3_MYrvye1p_hEw2xiUFYImznqTMuq2D4PG-pobz8YsyAcdFL6tsBnHNnNzq1SLwX47m6ArCZCbuVXm-sDWSHOExj21S3Xoy0RksxAOHGsU_BLAkat7l_oxRfI0Uk5WyfhkXzLKnY25EJCQrwk1h9PgnZ_eG6j_LbhabAZNp9GqBroD68PDZyl0M-BUcBQ-rJVzuBD45H5Z9k-1wZPPVjmNQmyFZ0ibTmtj-PaUOyQLfJI-7GWKR_ZZZ2HJSnDl_5A"
                    alt="Abstract server-side node network visualization with glowing light connections and technical architectural aesthetic"
                    className="w-full h-full object-cover opacity-80 mix-blend-luminosity grayscale group-hover:grayscale-0 transition-all duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-[#131313] to-[#41ffaf]/10 opacity-50"></div>
                  <div className="absolute bottom-6 left-6 right-6 p-6 bg-[#131313]/90 backdrop-blur-xl rounded-lg border border-white/5">
                    <div className="flex items-center justify-between mb-4">
                      <span className="label-font text-xs text-white/40">SERVER ARCHITECTURE</span>
                      <span className="text-[#5fde8f] label-font text-xs font-bold">ACTIVE</span>
                    </div>
                    <div className="space-y-2">
                      <div className="h-1 bg-[#5fde8f] w-full rounded-full"></div>
                      <div className="h-1 bg-[#5fde8f]/30 w-3/4 rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#41ffaf]/10 rounded-full blur-[100px]"></div>
              <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-[#41ffaf]/5 rounded-full blur-[120px]"></div>
            </div>
          </div>
        </section>

        {/* Trust strip — Ramp-style social proof band */}
        <section className="border-y border-white/[0.06] bg-white/[0.02] py-10">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
            <p className="mb-6 text-center text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
              Built for modern analytics &amp; growth teams
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 text-sm font-medium text-zinc-600">
              <span>Google Tag Manager</span>
              <span>GA4</span>
              <span>Server-side tagging</span>
              <span>AWS</span>
              <span>Privacy-first defaults</span>
            </div>
          </div>
        </section>

        {/* Migration Workspace Showcase */}
        <section id="product" className="overflow-hidden bg-[#1c1b1b] px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="mb-16 text-center md:mb-20">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#41ffaf]/90">Product</p>
              <h2 className="mb-4 text-3xl font-semibold tracking-tight text-white md:text-5xl">Migration workspace</h2>
              <p className="text-sm uppercase tracking-widest text-zinc-500">Precision mapping for your container</p>
            </div>
            <div className="relative max-w-5xl mx-auto">
              <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#131313] p-2 shadow-2xl">
                <div className="bg-[#1c1b1b] p-4 border-b border-[#5d3f3a]/10 flex items-center justify-between">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ffb4ab]/40"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ffb4a7]/40"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-[#5fde8f]/40"></div>
                  </div>
                  <div className="bg-[#353535] px-4 py-1 rounded-md text-[10px] label-font text-white/40">
                    container_v1_backup.json
                  </div>
                  <div className="w-10"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 min-h-[500px]">
                  {/* Left: File Scan */}
                  <div className="md:col-span-4 border-r border-[#5d3f3a]/10 p-6 space-y-6">
                    <div className="space-y-4">
                      <p className="label-font text-[10px] text-white/30 uppercase tracking-tighter">Container Elements</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 bg-[#2a2a2a] rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-sm text-[#5fde8f]">check_circle</span>
                            <span className="text-xs font-mono text-white">GA4 Configuration</span>
                          </div>
                          <span className="text-[9px] label-font text-white/40">READY</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-[#2a2a2a] rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-sm text-[#5fde8f]">check_circle</span>
                            <span className="text-xs font-mono text-white">Meta Pixel Base</span>
                          </div>
                          <span className="text-[9px] label-font text-white/40">READY</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-[#2a2a2a] rounded-lg border border-orange-500/20">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-sm text-orange-400">warning</span>
                            <span className="text-xs font-mono text-white">Custom JS Var</span>
                          </div>
                          <span className="text-[9px] label-font text-orange-400">RESOLVING</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Right: Console & Action */}
                  <div className="md:col-span-8 p-8 flex flex-col justify-between bg-[#0e0e0e]">
                    <div className="font-mono text-sm space-y-3 opacity-70">
                      <p className="text-[#5fde8f]">&gt; Analyzing client-side dependencies...</p>
                      <p className="text-white/60">&gt; Mapping 14 tags to server equivalents.</p>
                      <p className="text-white/60">&gt; Generating SGTM Provisioning script.</p>
                      <p className="text-white/40">&gt; Found 2 incompatible triggers. Applying auto-fixes...</p>
                      <p className="text-[#5fde8f]">&gt; Migration validation: 100% complete.</p>
                    </div>
                    <div className="mt-12 flex flex-col items-center">
                      <div className="mb-8 text-center">
                        <h3 className="text-xl font-bold mb-2 text-white">Ready for Server Deployment</h3>
                        <p className="text-sm text-[#bacbbe]">We&apos;ve mapped your entire environment.</p>
                      </div>
                      <Link href="/dashboard" className="group relative bg-[#41ffaf] text-[#003822] px-12 py-5 rounded-xl font-extrabold text-xl shadow-[0_0_40px_-10px_rgba(65,255,175,0.4)] hover:shadow-[0_0_60px_-10px_rgba(65,255,175,0.6)] transition-all flex items-center gap-4">
                        One-Click Convert
                        <span className="material-symbols-outlined text-2xl group-hover:translate-x-1 transition-transform" style={{fontVariationSettings: "'FILL' 1"}}>bolt</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="mx-auto max-w-7xl px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-[#41ffaf]/90">Platform</p>
          <h2 className="mb-14 text-center text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Everything you need to ship server-side tags
          </h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
            <div className="group rounded-3xl border border-white/[0.08] bg-[#20201f] p-10 transition-colors hover:bg-[#252524]">
              <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-[#353535] transition-colors group-hover:border-[#41ffaf]/30">
                <span className="material-symbols-outlined text-3xl text-[#41ffaf]">analytics</span>
              </div>
              <h3 className="text-2xl font-bold headline-font mb-4 text-white">Automatic Readiness Report</h3>
              <p className="text-[#bacbbe] leading-relaxed">Instantly identify which tags are compatible and which need adjustment before moving to the server.</p>
            </div>
            <div className="group rounded-3xl border border-white/[0.08] bg-[#20201f] p-10 transition-colors hover:bg-[#252524]">
              <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-[#353535] transition-colors group-hover:border-[#41ffaf]/30">
                <span className="material-symbols-outlined text-3xl text-[#41ffaf]">build</span>
              </div>
              <h3 className="text-2xl font-bold headline-font mb-4 text-white">Rule-Based Migration</h3>
              <p className="text-[#bacbbe] leading-relaxed">30+ production rules automatically convert your tags with confidence scoring and validation.</p>
            </div>
            <div className="group rounded-3xl border border-white/[0.08] bg-[#20201f] p-10 transition-colors hover:bg-[#252524]">
              <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-[#353535] transition-colors group-hover:border-white/25">
                <span className="material-symbols-outlined text-3xl text-white">lock</span>
              </div>
              <h3 className="text-2xl font-bold headline-font mb-4 text-white">Privacy-First</h3>
              <p className="text-[#bacbbe] leading-relaxed">GDPR/CCPA compliant with consent mode support. Own your first-party data infrastructure.</p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="mb-20 px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-white/[0.08] bg-gradient-to-br from-[#20201f] to-[#1c1b1b] p-12 text-center md:p-20">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(65,255,175,0.05),transparent)] pointer-events-none"></div>
            <h2 className="text-4xl md:text-6xl font-extrabold headline-font mb-6 relative z-10 text-white">Start your migration today.</h2>
            <p className="text-xl text-[#bacbbe] mb-12 max-w-2xl mx-auto relative z-10">Production-ready serverless architecture. Deploy to AWS in 15 minutes.</p>
            <div className="relative z-10 flex flex-col justify-center gap-4 sm:flex-row sm:gap-5">
              <Link
                href="/auth/register"
                className="rounded-full bg-[#41ffaf] px-10 py-5 text-lg font-semibold text-[#003822] transition-opacity hover:opacity-90 active:scale-[0.99]"
              >
                Get started free
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full border border-white/15 px-10 py-5 text-lg font-semibold text-white transition-colors hover:bg-white/5 active:scale-[0.99]"
              >
                View dashboard
              </Link>
            </div>
            <div className="mt-16 flex items-center justify-center gap-12 opacity-40 text-sm">
              <span className="label-font font-bold text-white">AWS Lambda</span>
              <span className="label-font font-bold text-white">DynamoDB</span>
              <span className="label-font font-bold text-white">Next.js</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#0e0e0e] px-5 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-12 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="text-lg font-bold text-white mb-6">Ovalt</div>
            <p className="text-white/40 text-sm leading-relaxed max-w-xs">
              The precision tool for modern marketing teams looking to own their first-party data infrastructure.
            </p>
          </div>
          <div className="space-y-4">
            <h4 className="label-font text-xs font-bold uppercase tracking-widest text-white mb-6">Platform</h4>
            <nav className="flex flex-col gap-3">
              <Link href="/dashboard" className="text-white/40 text-sm hover:text-[#41ffaf] transition-colors">Dashboard</Link>
              <Link href="/migrations" className="text-white/40 text-sm hover:text-[#41ffaf] transition-colors">Migrations</Link>
              <Link href="/imports" className="text-white/40 text-sm hover:text-[#41ffaf] transition-colors">Imports</Link>
            </nav>
          </div>
          <div className="space-y-4">
            <h4 className="label-font text-xs font-bold uppercase tracking-widest text-white mb-6">Resources</h4>
            <nav className="flex flex-col gap-3">
              <a href="/docs" className="text-white/40 text-sm hover:text-[#41ffaf] transition-colors">Documentation</a>
              <a href="https://github.com/YOUR_ORG/tag-relay" className="text-white/40 text-sm hover:text-[#41ffaf] transition-colors">GitHub</a>
              <a href="/api" className="text-white/40 text-sm hover:text-[#41ffaf] transition-colors">API</a>
            </nav>
          </div>
          <div className="space-y-4">
            <h4 className="label-font text-xs font-bold uppercase tracking-widest text-white mb-6">Legal</h4>
            <nav className="flex flex-col gap-3">
              <Link href="/privacy" className="text-white/40 text-sm hover:text-[#41ffaf] transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-white/40 text-sm hover:text-[#41ffaf] transition-colors">
                Terms of Service
              </Link>
            </nav>
          </div>
        </div>
        <div className="mx-auto mt-16 flex max-w-7xl flex-col items-center justify-between gap-6 border-t border-white/5 pt-8 md:flex-row">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
            <p className="text-xs uppercase tracking-widest text-white/20">© {new Date().getFullYear()} Ovalt. All rights reserved.</p>
            <div className="flex items-center gap-6 label-font text-xs">
              <Link href="/privacy" className="text-white/35 hover:text-[#41ffaf] transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="text-white/35 hover:text-[#41ffaf] transition-colors">
                Terms
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5fde8f]"></span>
              <span className="text-[10px] label-font text-white/40 tracking-widest">SYSTEMS OPERATIONAL</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
