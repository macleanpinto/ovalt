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

  const navLink = (path: string, label: string) => (
    <Link
      href={path}
      className={`text-sm font-medium transition-colors ${
        isActive(path) ? 'text-[#41ffaf]' : 'text-zinc-400 hover:text-white'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#131313]/85 backdrop-blur-xl ${className}`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-10">
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight text-[#41ffaf] transition-opacity hover:opacity-90"
          >
            Ovalt
          </Link>
          <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
            {navLink('/dashboard', 'Dashboard')}
            {navLink('/imports', 'Imports')}
            {navLink('/migrations', 'Migrations')}
            {navLink('/settings/team', 'Team')}
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-zinc-800 transition-all hover:ring-2 hover:ring-[#41ffaf]/40"
                aria-expanded={showUserMenu}
                aria-haspopup="true"
              >
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name || user.email} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-[#41ffaf]">
                    {(user.name || user.email).charAt(0).toUpperCase()}
                  </span>
                )}
              </button>

              {showUserMenu && (
                <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-white/10 bg-[#1c1b1b] py-1 shadow-2xl">
                  <div className="border-b border-white/10 px-4 py-3">
                    <p className="text-sm font-medium text-white">{user.name || user.email}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{user.email}</p>
                  </div>
                  {user.isPlatformAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setShowUserMenu(false)}
                      className="flex w-full items-center gap-2 border-b border-white/10 px-4 py-2.5 text-left text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <span className="material-symbols-outlined text-base">admin_panel_settings</span>
                      Admin
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setShowUserMenu(false);
                      router.push('/');
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <span className="material-symbols-outlined text-base">logout</span>
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/auth/login"
                className="rounded-full px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
              >
                Log in
              </Link>
              <Link
                href="/auth/register"
                className="rounded-full bg-[#41ffaf] px-5 py-2 text-sm font-semibold text-[#003822] transition-opacity hover:opacity-90"
              >
                Get started
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
