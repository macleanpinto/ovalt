'use client';

import Link from "next/link";
import { useState } from "react";

type CustomerType = 'freelancer' | 'agency';

export default function PricingPage() {
  const [customerType, setCustomerType] = useState<CustomerType>('freelancer');
  const [selectedPlatform, setSelectedPlatform] = useState<'ga4' | 'googleads' | 'meta'>('ga4');

  const freelancerPricing = {
    ga4: {
      name: 'GA4',
      small: '€49',
      medium: '€69',
      large: '€99',
      xl: 'Custom',
    },
    googleads: {
      name: 'Google Ads',
      small: '€59',
      medium: '€79',
      large: '€109',
      xl: 'Custom',
    },
    meta: {
      name: 'Meta Pixel',
      small: '€69',
      medium: '€89',
      large: '€119',
      xl: 'Custom',
    },
  };

  const agencyPlans = [
    {
      name: 'Agency Starter',
      price: '€195',
      period: '/mo',
      users: '3',
      onboardings: '4',
      bestFor: 'Small agencies',
      features: [
        '4 client onboardings/month',
        'Up to 3 team members',
        'Standard support',
        'Migration reports',
        'White-label available (+€15/client)'
      ]
    },
    {
      name: 'Agency Growth',
      price: '€395',
      period: '/mo',
      users: '10',
      onboardings: '10',
      bestFor: 'Growing teams',
      popular: true,
      features: [
        '10 client onboardings/month',
        'Up to 10 team members',
        'Priority support',
        'Migration reports',
        'White-label included'
      ]
    },
    {
      name: 'Agency Scale',
      price: '€795',
      period: '/mo',
      users: 'Unlimited',
      onboardings: '25',
      bestFor: 'High-volume agencies',
      features: [
        '25 client onboardings/month',
        'Unlimited team members',
        'Dedicated support',
        'API access',
        'White-label included'
      ]
    }
  ];

  const agencyOverages = [
    { name: 'Additional client onboarding', price: '€35', description: 'Extra client beyond monthly limit' },
    { name: 'Large tag set surcharge (26–50 tags)', price: '+€10', description: 'Per client with 26-50 tags' },
    { name: 'XL tag set (51+ tags)', price: 'Custom', description: 'Contact sales for pricing' },
  ];

  return (
    <div className="bg-[#131313] text-[#e5e2e1] min-h-screen">
      {/* Header */}
      <header className="bg-[#131313] sticky top-0 border-b border-[#20201F] z-50">
        <div className="flex justify-between items-center w-full px-6 py-4 max-w-[1200px] mx-auto">
          <Link href="/" className="flex items-center gap-2 active:scale-95 transition-transform">
            <span className="material-symbols-outlined text-[#41FFAF]">terminal</span>
            <span className="font-['Inter'] font-medium tracking-tight text-xl font-black tracking-tighter text-[#41FFAF] uppercase">OVALT</span>
          </Link>
          <Link href="/" className="text-[#bacbbe] hover:text-[#41FFAF] transition-colors">
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-20">
        {/* Hero Section */}
        <section className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 bg-[#20201f] px-3 py-1 rounded-full mb-4 sm:mb-6 border border-[#3b4a40]">
            <span className="w-2 h-2 rounded-full bg-[#41FFAF]"></span>
            <span className="font-['Space_Grotesk'] text-[10px] sm:text-[12px] tracking-[0.1em] font-medium text-[#bacbbe]">
              FLEXIBLE PRICING
            </span>
          </div>

          <h1 className="font-['Inter'] text-[32px] sm:text-[48px] md:text-[64px] lg:text-[72px] leading-[1.1] font-bold tracking-[-0.02em] text-[#e5e2e1] mb-4 sm:mb-6 px-4">
            Pricing for <span className="text-[#41FFAF]">Every Team</span>
          </h1>

          <p className="font-['Inter'] text-[16px] sm:text-[18px] leading-[1.6] text-[#bacbbe] max-w-[600px] mx-auto px-4">
            For freelancers and agencies. Choose the plan that fits your workflow.
          </p>
        </section>

        {/* Customer Type Selector */}
        <section className="mb-12 sm:mb-16">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center max-w-3xl mx-auto">
            <button
              onClick={() => setCustomerType('freelancer')}
              className={`px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-['Space_Grotesk'] text-[12px] sm:text-[14px] tracking-[0.05em] font-medium transition-all active:scale-95 ${
                customerType === 'freelancer'
                  ? 'bg-[#41FFAF] text-[#131313]'
                  : 'bg-[#20201f] text-[#bacbbe] border border-white/5 hover:border-[#41FFAF]/30'
              }`}
            >
              <span className="material-symbols-outlined text-base sm:text-lg align-middle mr-2">person</span>
              Freelancers
            </button>
            <button
              onClick={() => setCustomerType('agency')}
              className={`px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-['Space_Grotesk'] text-[12px] sm:text-[14px] tracking-[0.05em] font-medium transition-all active:scale-95 ${
                customerType === 'agency'
                  ? 'bg-[#41FFAF] text-[#131313]'
                  : 'bg-[#20201f] text-[#bacbbe] border border-white/5 hover:border-[#41FFAF]/30'
              }`}
            >
              <span className="material-symbols-outlined text-base sm:text-lg align-middle mr-2">groups</span>
              Agencies
            </button>
          </div>
        </section>

        {/* FREELANCER PRICING */}
        {customerType === 'freelancer' && (
          <>
            {/* Target Audience */}
            <section className="mb-12 sm:mb-16 bg-[#20201f] p-6 sm:p-8 rounded-xl border border-white/5">
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <span className="material-symbols-outlined text-[#41FFAF] text-2xl sm:text-3xl">person</span>
                <div className="flex-1">
                  <h2 className="font-['Inter'] text-[20px] sm:text-[24px] leading-[1.3] font-semibold text-[#e5e2e1] mb-2 sm:mb-3">
                    Perfect for Freelancers & Solo Marketers
                  </h2>
                  <p className="font-['Inter'] text-[14px] sm:text-[16px] leading-[1.5] text-[#bacbbe] mb-3 sm:mb-4">
                    No subscription commitment. Predictable pricing per setup. Fast checkout.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-[#353535] rounded-full font-['Space_Grotesk'] text-[10px] sm:text-[12px] tracking-[0.1em] font-medium text-[#bacbbe]">
                      One-time payment
                    </span>
                    <span className="px-3 py-1 bg-[#353535] rounded-full font-['Space_Grotesk'] text-[10px] sm:text-[12px] tracking-[0.1em] font-medium text-[#bacbbe]">
                      No monthly fees
                    </span>
                    <span className="px-3 py-1 bg-[#353535] rounded-full font-['Space_Grotesk'] text-[10px] sm:text-[12px] tracking-[0.1em] font-medium text-[#bacbbe]">
                      Instant access
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Platform Selector */}
            <section className="mb-8 sm:mb-12">
              <h2 className="font-['Inter'] text-[24px] sm:text-[28px] md:text-[32px] leading-[1.3] font-semibold text-[#e5e2e1] mb-6 sm:mb-8 text-center">
                Select Your Platform
              </h2>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center max-w-2xl mx-auto">
                <button
                  onClick={() => setSelectedPlatform('ga4')}
                  className={`px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-['Space_Grotesk'] text-[12px] sm:text-[14px] tracking-[0.05em] font-medium transition-all active:scale-95 ${
                    selectedPlatform === 'ga4'
                      ? 'bg-[#41FFAF] text-[#131313]'
                      : 'bg-[#20201f] text-[#bacbbe] border border-white/5 hover:border-[#41FFAF]/30'
                  }`}
                >
                  <span className="material-symbols-outlined text-base sm:text-lg align-middle mr-2">analytics</span>
                  GA4
                </button>
                <button
                  onClick={() => setSelectedPlatform('googleads')}
                  className={`px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-['Space_Grotesk'] text-[12px] sm:text-[14px] tracking-[0.05em] font-medium transition-all active:scale-95 ${
                    selectedPlatform === 'googleads'
                      ? 'bg-[#41FFAF] text-[#131313]'
                      : 'bg-[#20201f] text-[#bacbbe] border border-white/5 hover:border-[#41FFAF]/30'
                  }`}
                >
                  <span className="material-symbols-outlined text-base sm:text-lg align-middle mr-2">ads_click</span>
                  Google Ads
                </button>
                <button
                  onClick={() => setSelectedPlatform('meta')}
                  className={`px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-['Space_Grotesk'] text-[12px] sm:text-[14px] tracking-[0.05em] font-medium transition-all active:scale-95 ${
                    selectedPlatform === 'meta'
                      ? 'bg-[#41FFAF] text-[#131313]'
                      : 'bg-[#20201f] text-[#bacbbe] border border-white/5 hover:border-[#41FFAF]/30'
                  }`}
                >
                  <span className="material-symbols-outlined text-base sm:text-lg align-middle mr-2">photo_camera</span>
                  Meta Pixel
                </button>
              </div>
            </section>

            {/* Pricing Table */}
            <section className="mb-12 sm:mb-16">
              <div className="bg-[#20201f] rounded-xl border border-white/5 overflow-x-auto -mx-4 sm:mx-0">
                <div className="min-w-[640px]">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/5 bg-[#1c1b1b]">
                        <th className="text-left p-3 sm:p-4 md:p-6 font-['Space_Grotesk'] text-[10px] sm:text-[12px] tracking-[0.1em] font-medium text-[#bacbbe] uppercase">
                          Platform
                        </th>
                        <th className="text-center p-3 sm:p-4 md:p-6">
                          <div className="font-['Space_Grotesk'] text-[10px] sm:text-[12px] tracking-[0.1em] font-medium text-[#bacbbe] uppercase mb-1">
                            Small
                          </div>
                          <div className="font-['Inter'] text-[11px] sm:text-[13px] md:text-[14px] text-[#bacbbe]/60 whitespace-nowrap">
                            1–10 tags
                          </div>
                        </th>
                        <th className="text-center p-3 sm:p-4 md:p-6">
                          <div className="font-['Space_Grotesk'] text-[10px] sm:text-[12px] tracking-[0.1em] font-medium text-[#bacbbe] uppercase mb-1">
                            Medium
                          </div>
                          <div className="font-['Inter'] text-[11px] sm:text-[13px] md:text-[14px] text-[#bacbbe]/60 whitespace-nowrap">
                            11–25 tags
                          </div>
                        </th>
                        <th className="text-center p-3 sm:p-4 md:p-6">
                          <div className="font-['Space_Grotesk'] text-[10px] sm:text-[12px] tracking-[0.1em] font-medium text-[#bacbbe] uppercase mb-1">
                            Large
                          </div>
                          <div className="font-['Inter'] text-[11px] sm:text-[13px] md:text-[14px] text-[#bacbbe]/60 whitespace-nowrap">
                            26–50 tags
                          </div>
                        </th>
                        <th className="text-center p-3 sm:p-4 md:p-6">
                          <div className="font-['Space_Grotesk'] text-[10px] sm:text-[12px] tracking-[0.1em] font-medium text-[#bacbbe] uppercase mb-1">
                            XL
                          </div>
                          <div className="font-['Inter'] text-[11px] sm:text-[13px] md:text-[14px] text-[#bacbbe]/60">
                            51+ tags
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(freelancerPricing).map(([key, platform]) => (
                        <tr
                          key={key}
                          className={`border-b border-white/5 transition-colors ${
                            selectedPlatform === key ? 'bg-[#41FFAF]/5' : 'hover:bg-[#2a2a2a]/50'
                          }`}
                        >
                          <td className="p-3 sm:p-4 md:p-6">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className={`w-1 h-8 sm:h-10 md:h-12 rounded-full ${selectedPlatform === key ? 'bg-[#41FFAF]' : 'bg-transparent'}`}></div>
                              <span className="font-['Inter'] text-[14px] sm:text-[16px] md:text-[18px] font-medium text-[#e5e2e1] whitespace-nowrap">
                                {platform.name}
                              </span>
                            </div>
                          </td>
                          <td className="text-center p-3 sm:p-4 md:p-6">
                            <span className="font-['Inter'] text-[18px] sm:text-[20px] md:text-[24px] font-bold text-[#41FFAF]">
                              {platform.small}
                            </span>
                          </td>
                          <td className="text-center p-3 sm:p-4 md:p-6">
                            <span className="font-['Inter'] text-[18px] sm:text-[20px] md:text-[24px] font-bold text-[#41FFAF]">
                              {platform.medium}
                            </span>
                          </td>
                          <td className="text-center p-3 sm:p-4 md:p-6">
                            <span className="font-['Inter'] text-[18px] sm:text-[20px] md:text-[24px] font-bold text-[#41FFAF]">
                              {platform.large}
                            </span>
                          </td>
                          <td className="text-center p-3 sm:p-4 md:p-6">
                            <span className="font-['Inter'] text-[14px] sm:text-[15px] md:text-[16px] font-medium text-[#bacbbe]">
                              {platform.xl}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 sm:mt-6 text-center px-4">
                <p className="font-['Inter'] text-[12px] sm:text-[14px] text-[#bacbbe]">
                  <span className="text-[#41FFAF]">Custom pricing</span> available for 51+ tags or multi-platform projects.{' '}
                  <a href="mailto:sales@ovalt.org" className="underline hover:text-[#41FFAF] transition-colors">
                    Contact us
                  </a>
                </p>
              </div>
            </section>

          </>
        )}

        {/* AGENCY PRICING */}
        {customerType === 'agency' && (
          <>
            {/* Target Audience */}
            <section className="mb-12 sm:mb-16 bg-[#20201f] p-6 sm:p-8 rounded-xl border border-white/5">
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <span className="material-symbols-outlined text-[#41FFAF] text-2xl sm:text-3xl">groups</span>
                <div className="flex-1">
                  <h2 className="font-['Inter'] text-[20px] sm:text-[24px] leading-[1.3] font-semibold text-[#e5e2e1] mb-2 sm:mb-3">
                    Built for Growing Agencies
                  </h2>
                  <p className="font-['Inter'] text-[14px] sm:text-[16px] leading-[1.5] text-[#bacbbe] mb-3 sm:mb-4">
                    Monthly subscription with included client onboardings. Scale as you grow.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-[#353535] rounded-full font-['Space_Grotesk'] text-[10px] sm:text-[12px] tracking-[0.1em] font-medium text-[#bacbbe]">
                      Monthly subscription
                    </span>
                    <span className="px-3 py-1 bg-[#353535] rounded-full font-['Space_Grotesk'] text-[10px] sm:text-[12px] tracking-[0.1em] font-medium text-[#bacbbe]">
                      Included onboardings
                    </span>
                    <span className="px-3 py-1 bg-[#353535] rounded-full font-['Space_Grotesk'] text-[10px] sm:text-[12px] tracking-[0.1em] font-medium text-[#bacbbe]">
                      Team seats
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Agency Plans */}
            <section className="mb-12 sm:mb-16">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                {agencyPlans.map((plan, index) => (
                  <div
                    key={index}
                    className={`bg-[#20201f] rounded-xl border overflow-hidden ${
                      plan.popular ? 'border-[#41FFAF] shadow-lg shadow-[#41FFAF]/10 lg:scale-105' : 'border-white/5'
                    }`}
                  >
                    {plan.popular && (
                      <div className="bg-[#41FFAF] text-[#131313] text-center py-2 font-['Space_Grotesk'] text-[11px] sm:text-[12px] tracking-[0.1em] font-bold">
                        MOST POPULAR
                      </div>
                    )}
                    <div className="p-6 sm:p-8">
                      <h3 className="font-['Inter'] text-[20px] sm:text-[24px] font-bold text-[#e5e2e1] mb-2">
                        {plan.name}
                      </h3>
                      <div className="mb-4">
                        <span className="font-['Inter'] text-[40px] sm:text-[48px] font-bold text-[#41FFAF]">
                          {plan.price}
                        </span>
                        <span className="font-['Inter'] text-[16px] sm:text-[18px] text-[#bacbbe]">
                          {plan.period}
                        </span>
                      </div>
                      <p className="font-['Inter'] text-[13px] sm:text-[14px] text-[#bacbbe] mb-6">
                        {plan.bestFor}
                      </p>
                      <div className="space-y-3 mb-6 sm:mb-8">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#41FFAF] text-sm">groups</span>
                          <span className="font-['Inter'] text-[13px] sm:text-[14px] text-[#e5e2e1]">
                            {plan.users} users
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#41FFAF] text-sm">rocket_launch</span>
                          <span className="font-['Inter'] text-[13px] sm:text-[14px] text-[#e5e2e1]">
                            {plan.onboardings} client onboardings/mo
                          </span>
                        </div>
                      </div>
                      <ul className="space-y-2 mb-6 sm:mb-8">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-[#41FFAF] text-sm mt-0.5 shrink-0">check</span>
                            <span className="font-['Inter'] text-[13px] sm:text-[14px] text-[#bacbbe] leading-relaxed">
                              {feature}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <Link
                        href="/dashboard"
                        className={`block text-center px-6 py-3 rounded-lg font-['Space_Grotesk'] text-[13px] sm:text-[14px] tracking-[0.05em] font-medium transition-all active:scale-95 ${
                          plan.popular
                            ? 'bg-[#41FFAF] text-[#131313]'
                            : 'bg-[#353535] text-white hover:bg-[#404040]'
                        }`}
                      >
                        GET STARTED
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Agency Overages */}
            <section className="mb-12 sm:mb-16">
              <h2 className="font-['Inter'] text-[24px] sm:text-[28px] md:text-[32px] leading-[1.3] font-semibold text-[#e5e2e1] mb-6 sm:mb-8">
                Overage Pricing
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                {agencyOverages.map((overage, index) => (
                  <div
                    key={index}
                    className="bg-[#20201f] p-6 sm:p-8 rounded-xl border border-white/5"
                  >
                    <div className="flex items-start justify-between mb-3 sm:mb-4">
                      <span className="material-symbols-outlined text-[#41FFAF] text-xl sm:text-2xl">add</span>
                      <span className="font-['Inter'] text-[18px] sm:text-[20px] font-bold text-[#41FFAF]">
                        {overage.price}
                      </span>
                    </div>
                    <h3 className="font-['Inter'] text-[16px] sm:text-[18px] font-semibold text-[#e5e2e1] mb-2">
                      {overage.name}
                    </h3>
                    <p className="font-['Inter'] text-[13px] sm:text-[14px] text-[#bacbbe] leading-relaxed">
                      {overage.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* What's Included (Common) */}
        <section className="mb-12 sm:mb-16 bg-[#20201f] p-6 sm:p-8 md:p-12 rounded-xl border border-white/5">
          <h2 className="font-['Inter'] text-[24px] sm:text-[28px] md:text-[32px] leading-[1.3] font-semibold text-[#e5e2e1] mb-6 sm:mb-8 text-center">
            What&apos;s Included
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div className="flex items-start gap-3 sm:gap-4">
              <span className="material-symbols-outlined text-[#41FFAF] text-xl sm:text-2xl shrink-0">check_circle</span>
              <div>
                <h3 className="font-['Inter'] text-[15px] sm:text-[16px] font-semibold text-[#e5e2e1] mb-1">
                  Automated Migration
                </h3>
                <p className="font-['Inter'] text-[13px] sm:text-[14px] text-[#bacbbe] leading-relaxed">
                  30+ production rules convert your tags automatically
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 sm:gap-4">
              <span className="material-symbols-outlined text-[#41FFAF] text-xl sm:text-2xl shrink-0">check_circle</span>
              <div>
                <h3 className="font-['Inter'] text-[15px] sm:text-[16px] font-semibold text-[#e5e2e1] mb-1">
                  Review Flagging
                </h3>
                <p className="font-['Inter'] text-[13px] sm:text-[14px] text-[#bacbbe] leading-relaxed">
                  Provisional or incomplete mappings are flagged for review before deploy
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 sm:gap-4">
              <span className="material-symbols-outlined text-[#41FFAF] text-xl sm:text-2xl shrink-0">check_circle</span>
              <div>
                <h3 className="font-['Inter'] text-[15px] sm:text-[16px] font-semibold text-[#e5e2e1] mb-1">
                  Server-Side Deployment
                </h3>
                <p className="font-['Inter'] text-[13px] sm:text-[14px] text-[#bacbbe] leading-relaxed">
                  One-click deploy to Google Tag Manager Server
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 sm:gap-4">
              <span className="material-symbols-outlined text-[#41FFAF] text-xl sm:text-2xl shrink-0">check_circle</span>
              <div>
                <h3 className="font-['Inter'] text-[15px] sm:text-[16px] font-semibold text-[#e5e2e1] mb-1">
                  Privacy-First
                </h3>
                <p className="font-['Inter'] text-[13px] sm:text-[14px] text-[#bacbbe] leading-relaxed">
                  GDPR/CCPA compliant with consent mode support
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 sm:gap-4">
              <span className="material-symbols-outlined text-[#41FFAF] text-xl sm:text-2xl shrink-0">check_circle</span>
              <div>
                <h3 className="font-['Inter'] text-[15px] sm:text-[16px] font-semibold text-[#e5e2e1] mb-1">
                  Migration Report
                </h3>
                <p className="font-['Inter'] text-[13px] sm:text-[14px] text-[#bacbbe] leading-relaxed">
                  Detailed breakdown of all changes and recommendations
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 sm:gap-4">
              <span className="material-symbols-outlined text-[#41FFAF] text-xl sm:text-2xl shrink-0">check_circle</span>
              <div>
                <h3 className="font-['Inter'] text-[15px] sm:text-[16px] font-semibold text-[#e5e2e1] mb-1">
                  {customerType === 'agency' ? 'Priority Support' : 'Email Support'}
                </h3>
                <p className="font-['Inter'] text-[13px] sm:text-[14px] text-[#bacbbe] leading-relaxed">
                  {customerType === 'agency' ? 'Priority email and chat support' : 'Get help within 24 hours via email'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-[#41FFAF] rounded-xl p-8 sm:p-12 md:p-16 text-center">
          <h2 className="font-['Inter'] text-[32px] sm:text-[40px] md:text-[48px] leading-[1.1] font-bold tracking-[-0.02em] text-[#131313] mb-3 sm:mb-4">
            Ready to migrate?
          </h2>
          <p className="text-[#003822] font-['Inter'] text-[15px] sm:text-[16px] md:text-[18px] leading-[1.6] max-w-[500px] mx-auto mb-6 sm:mb-8 px-4">
            Import your container and see the exact pricing for your project.
          </p>
          <Link
            href="/dashboard"
            className="inline-block bg-[#131313] text-white px-8 sm:px-12 py-3 sm:py-4 rounded-lg font-['Space_Grotesk'] text-[12px] sm:text-[14px] tracking-[0.05em] font-medium uppercase active:scale-95 transition-transform"
          >
            {customerType === 'agency' ? 'START FREE TRIAL' : 'IMPORT CONTAINER'}
          </Link>
          <p className="mt-4 sm:mt-6 text-[#003822]/60 font-['Inter'] text-[12px] sm:text-[14px] px-4">
            No credit card required • See pricing before you commit
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#131313] border-t border-[#20201F] mt-20">
        <div className="w-full px-6 py-12 flex flex-col md:flex-row justify-between items-center gap-8 max-w-[1200px] mx-auto">
          <div className="flex flex-col gap-1 items-center md:items-start">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#41FFAF]">terminal</span>
              <span className="text-[#41FFAF] font-bold font-['Inter'] text-sm uppercase">OVALT.ORG</span>
            </div>
            <p className="text-white/40 font-['Inter'] text-sm">© 2024 OVALT. ALL RIGHTS RESERVED.</p>
          </div>
          <div className="flex gap-12">
            <Link className="text-white/40 font-['Inter'] text-sm hover:text-[#41FFAF] transition-colors" href="/privacy">Privacy</Link>
            <Link className="text-white/40 font-['Inter'] text-sm hover:text-[#41FFAF] transition-colors" href="/terms">Terms</Link>
            <Link className="text-white/40 font-['Inter'] text-sm hover:text-[#41FFAF] transition-colors" href="/">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
