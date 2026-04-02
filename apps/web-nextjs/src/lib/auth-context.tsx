'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, User, Organization } from './api-client';

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  setOrganization: (org: Organization) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Load user on mount
  useEffect(() => {
    const loadUser = async () => {
      // Skip auth check on callback page - it handles token storage
      if (typeof window !== "undefined" && window.location.pathname === "/auth/callback") {
        setIsLoading(false);
        return;
      }

      try {
        const { user: userData, organization: orgFromMe } = await apiClient.getMeWithOrg();
        setUser(userData);
        setOrganization(orgFromMe);

        // Best-effort: refresh org list (don’t clear token if this fails)
        try {
          const orgs = await apiClient.getOrganizations();
          if (orgs.length > 0) {
            setOrganization(orgs[0]);
          }
        } catch {
          // ignore
        }
      } catch (error: any) {
        // Only log non-401 errors (401 just means not logged in)
        if (error?.status !== 401) {
          console.error("Failed to load user:", error);
        }
        apiClient.clearToken();
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    const { token, user: userData, organization: org } = await apiClient.login(email, password);
    apiClient.setToken(token);
    setUser(userData);

    if (org) {
      setOrganization(org);
    } else {
      // Load organizations
      const orgs = await apiClient.getOrganizations();
      if (orgs.length > 0) {
        setOrganization(orgs[0]);
      }
    }

    router.push('/dashboard');
  };

  const register = async (email: string, password: string, name: string) => {
    const { token, user: userData, organization: org } = await apiClient.register(email, password, name);
    apiClient.setToken(token);
    setUser(userData);

    if (org) {
      setOrganization(org);
    } else {
      // Load organizations (should have one created automatically)
      const orgs = await apiClient.getOrganizations();
      if (orgs.length > 0) {
        setOrganization(orgs[0]);
      }
    }

    router.push('/dashboard');
  };

  const logout = () => {
    apiClient.clearToken();
    setUser(null);
    setOrganization(null);
    router.push('/auth/login');
  };

  const value = {
    user,
    organization,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    setOrganization,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#131313] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ffb4a7] mx-auto"></div>
          <p className="mt-4 text-[#e6bdb6]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
