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
      <nav className="fixed top-0 w-full z-50 bg-[#131313]/80 backdrop-blur-xl">
        <div className="flex justify-between items-center px-8 py-4 max-w-[1440px] mx-auto">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandLogo priority />
          </Link>
          <div className="hidden md:flex items-center gap-10">
            <a className="text-[#41ffaf] font-semibold label-font transition-colors duration-300" href="#product">Product</a>
            <a className="text-white/70 label-font hover:text-white transition-colors duration-300" href="#features">Features</a>
            <a className="text-white/70 label-font hover:text-white transition-colors duration-300" href="#pricing">Pricing</a>
            <Link href="/dashboard" className="text-white/70 label-font hover:text-white transition-colors duration-300">Dashboard</Link>
          </div>
          <div className="flex items-center gap-6">
            {isLoading ? (
              <div className="w-32 h-10 bg-[#353535] rounded-xl animate-pulse"></div>
            ) : user ? (
              <UserMenu />
            ) : (
              <>
                <Link href="/auth/login" className="text-white/70 text-sm label-font hover:text-white transition-colors duration-300">
                  Sign In
                </Link>
                <Link href="/auth/register" className="bg-[#41ffaf] text-[#003822] px-6 py-2.5 rounded-xl font-semibold label-font hover:opacity-90 transition-all">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-32">
        {/* Hero Section */}
        <section className="max-w-[1440px] mx-auto px-8 mb-40">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 bg-[#20201f] rounded-full border border-[#5d3f3a]/15">
                <span className="w-2 h-2 rounded-full bg-[#5fde8f]"></span>
                <span className="label-font text-[10px] uppercase tracking-widest text-[#5fde8f]">Production Ready</span>
              </div>
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight headline-font leading-[1.05] text-white mb-8">
                Move your GTM to the <span className="text-[#41ffaf]">Server</span> without a Developer.
              </h1>
              <p className="text-lg md:text-xl text-[#bacbbe] max-w-xl leading-relaxed mb-10">
                Convert client-side containers into enterprise-grade server-side infrastructure in minutes. Privacy-first tracking, zero code required.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/dashboard" className="bg-[#41ffaf] text-[#003822] px-8 py-4 rounded-xl font-bold text-lg hover:opacity-90 transition-all flex items-center justify-center gap-2">
                  Import your Container
                  <span className="material-symbols-outlined">arrow_forward</span>
                </Link>
                <Link href="#demo" className="bg-[#353535] text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-[#2a2a2a] transition-all">
                  View Live Demo
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

        {/* Migration Workspace Showcase */}
        <section id="product" className="bg-[#1c1b1b] py-32 px-8 overflow-hidden">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-3xl md:text-5xl font-bold headline-font mb-6 text-white">Migration Workspace</h2>
              <p className="label-font text-sm uppercase tracking-widest text-[#bacbbe]">Precision Engineering for your Data</p>
            </div>
            <div className="relative max-w-5xl mx-auto">
              <div className="bg-[#131313] border border-white/10 rounded-2xl p-2 shadow-2xl overflow-hidden">
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
        <section id="features" className="py-32 max-w-[1440px] mx-auto px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-10 rounded-2xl bg-[#20201f] hover:bg-[#2a2a2a] transition-colors group">
              <div className="w-14 h-14 rounded-xl bg-[#353535] flex items-center justify-center mb-8 border border-white/10 group-hover:border-[#41ffaf]/30 transition-colors">
                <span className="material-symbols-outlined text-[#41ffaf] text-3xl">analytics</span>
              </div>
              <h3 className="text-2xl font-bold headline-font mb-4 text-white">Automatic Readiness Report</h3>
              <p className="text-[#bacbbe] leading-relaxed">Instantly identify which tags are compatible and which need adjustment before moving to the server.</p>
            </div>
            <div className="p-10 rounded-2xl bg-[#20201f] hover:bg-[#2a2a2a] transition-colors group">
              <div className="w-14 h-14 rounded-xl bg-[#353535] flex items-center justify-center mb-8 border border-white/10 group-hover:border-[#41ffaf]/30 transition-colors">
                <span className="material-symbols-outlined text-[#41ffaf] text-3xl">build</span>
              </div>
              <h3 className="text-2xl font-bold headline-font mb-4 text-white">Rule-Based Migration</h3>
              <p className="text-[#bacbbe] leading-relaxed">30+ production rules automatically convert your tags with confidence scoring and validation.</p>
            </div>
            <div className="p-10 rounded-2xl bg-[#20201f] hover:bg-[#2a2a2a] transition-colors group">
              <div className="w-14 h-14 rounded-xl bg-[#353535] flex items-center justify-center mb-8 border border-white/10 group-hover:border-white/30 transition-colors">
                <span className="material-symbols-outlined text-white text-3xl">lock</span>
              </div>
              <h3 className="text-2xl font-bold headline-font mb-4 text-white">Privacy-First</h3>
              <p className="text-[#bacbbe] leading-relaxed">GDPR/CCPA compliant with consent mode support. Own your first-party data infrastructure.</p>
            </div>
          </div>
        </section>

        {/* CTA / Pricing Section */}
        <section id="pricing" className="py-32 px-8 mb-20">
          <div className="max-w-5xl mx-auto rounded-[2rem] bg-gradient-to-br from-[#20201f] to-[#1c1b1b] border border-white/10 p-12 md:p-20 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(65,255,175,0.05),transparent)] pointer-events-none"></div>
            <h2 className="text-4xl md:text-6xl font-extrabold headline-font mb-6 relative z-10 text-white">Start your migration today.</h2>
            <p className="text-xl text-[#bacbbe] mb-12 max-w-2xl mx-auto relative z-10">Production-ready serverless architecture. Deploy to AWS in 15 minutes.</p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center relative z-10">
              <Link href="/auth/register" className="bg-[#41ffaf] text-[#003822] px-12 py-5 rounded-xl font-bold text-xl hover:opacity-90 transition-all active:scale-95">
                Get Started for Free
              </Link>
              <Link href="/dashboard" className="border border-white/10 px-12 py-5 rounded-xl font-bold text-xl hover:bg-white/5 transition-all text-white active:scale-95">
                View Dashboard
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
      <footer className="bg-[#0e0e0e] w-full py-16 px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 max-w-[1440px] mx-auto">
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
        <div className="max-w-[1440px] mx-auto mt-16 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
            <p className="text-white/20 text-xs uppercase tracking-widest">© 2024 Ovalt. All rights reserved.</p>
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
