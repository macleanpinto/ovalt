"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";

function OAuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get("token");
      const provider = searchParams.get("provider");
      const errorParam = searchParams.get("error");

      if (errorParam) {
        setError(`OAuth error: ${errorParam}`);
        setTimeout(() => router.push("/auth/login"), 3000);
        return;
      }

      if (!token) {
        setError("No token received from OAuth provider");
        setTimeout(() => router.push("/auth/login"), 3000);
        return;
      }

      // Store token
      apiClient.setToken(token);

      // Navigate to dashboard
      router.push("/dashboard");
    };

    handleCallback();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#131313] flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="bg-[#93000a]/20 border border-[#ffb4ab]/20 rounded-xl p-6 text-center">
            <h1 className="text-xl font-bold text-[#ffb4ab] mb-2 headline-font">
              Authentication Failed
            </h1>
            <p className="text-[#ffb4ab]">{error}</p>
            <p className="text-[#e6bdb6] mt-4 text-sm">Redirecting to login...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#131313] flex items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        <div className="bg-[#20201f] border border-[#5d3f3a]/15 rounded-xl p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ffb4a7] mx-auto mb-4"></div>
          <h1 className="text-xl font-bold text-white mb-2 headline-font">
            Completing Sign In
          </h1>
          <p className="text-[#e6bdb6]">Please wait...</p>
        </div>
      </div>
    </div>
  );
}

export default function OAuthCallback() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#131313] flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ffb4a7]" />
        </div>
      }
    >
      <OAuthCallbackInner />
    </Suspense>
  );
}
