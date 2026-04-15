'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

interface AppHeaderProps {
  className?: string;
}

export default function AppHeader({ className = '' }: AppHeaderProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (path: string) => pathname?.startsWith(path);

  return (
    <header className={`bg-[#1A1A1A]/80 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center w-full px-8 h-16 border-b border-white/5 ${className}`}>
      <div className="flex items-center gap-8">
        <Link href="/dashboard" className="text-xl font-bold tracking-tighter text-[#41ffaf]">
          Ovalt
        </Link>
        <nav className="hidden md:flex gap-6">
          <Link
            className={`font-medium transition-colors pb-1 ${
              isActive('/dashboard')
                ? 'text-[#41ffaf] font-semibold border-b-2 border-[#41ffaf]'
                : 'text-gray-400 hover:text-white'
            }`}
            href="/dashboard"
          >
            Dashboard
          </Link>
          <Link
            className={`font-medium transition-colors pb-1 ${
              isActive('/import')
                ? 'text-[#41ffaf] font-semibold border-b-2 border-[#41ffaf]'
                : 'text-gray-400 hover:text-white'
            }`}
            href="/imports"
          >
            Imports
          </Link>
          <Link
            className={`font-medium transition-colors pb-1 ${
              isActive('/migration')
                ? 'text-[#41ffaf] font-semibold border-b-2 border-[#41ffaf]'
                : 'text-gray-400 hover:text-white'
            }`}
            href="/migrations"
          >
            Migrations
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        {user ? (
          <>
            <button className="p-2 text-gray-400 hover:bg-white/5 hover:text-white rounded-lg transition-all duration-200">
              <span className="material-symbols-outlined text-xl">notifications</span>
            </button>
            <button className="p-2 text-gray-400 hover:bg-white/5 hover:text-white rounded-lg transition-all duration-200">
              <span className="material-symbols-outlined text-xl">terminal</span>
            </button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="h-9 w-9 rounded-full bg-[#353535] overflow-hidden hover:ring-2 hover:ring-[#41ffaf]/50 transition-all"
              >
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name || user.email} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-[#41ffaf]">
                    {(user.name || user.email).charAt(0).toUpperCase()}
                  </div>
                )}
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-[#2a2a2a] rounded-lg shadow-xl border border-white/10 py-2 z-50">
                  <div className="px-4 py-3 border-b border-white/10">
                    <p className="text-sm font-medium text-white">{user.name || user.email}</p>
                    <p className="text-xs text-gray-400 mt-1">{user.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      setShowUserMenu(false);
                      router.push('/');
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-base">logout</span>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-semibold bg-[#41ffaf] text-[#003822] rounded-lg hover:opacity-90 transition-all"
            >
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
