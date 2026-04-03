"use client";

import { Suspense } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { useSearchParams } from "next/navigation";

function OAuthErrorInner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "Unknown error";
  const provider = searchParams.get("provider") || "OAuth provider";

  return (
    <div className="min-h-screen bg-[#131313] flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex mb-4 justify-center">
            <BrandLogo />
          </Link>
          <h1 className="text-3xl font-bold mb-2 text-[#ffb4ab] headline-font">
            Authentication Error
          </h1>
          <p className="text-[#e6bdb6]">
            Something went wrong with {provider}
          </p>
        </div>

        <div className="bg-[#20201f] border border-[#5d3f3a]/15 rounded-xl shadow-2xl p-8">
          <div className="bg-[#93000a]/20 border border-[#ffb4ab]/20 rounded-lg p-4 mb-6">
            <p className="text-sm text-[#ffb4ab] text-center">
              {error === "access_denied"
                ? "You cancelled the authorization request"
                : error}
            </p>
          </div>

          <div className="space-y-4">
            <Link
              href="/auth/login"
              className="block w-full px-6 py-3 bg-[#ff553c] text-white rounded-xl font-semibold label-font hover:brightness-110 transition-all text-center"
            >
              Try Again
            </Link>
            <Link
              href="/"
              className="block w-full px-6 py-3 border border-[#ad8881]/30 text-white rounded-xl hover:bg-[#2a2a2a] transition-colors label-font text-center"
            >
              Back to Home
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-white/40">
          If this problem persists, please contact support
        </p>
      </div>
    </div>
  );
}

export default function OAuthError() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#131313]" />}>
      <OAuthErrorInner />
    </Suspense>
  );
}
