'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function UserMenu() {
  const router = useRouter();
  const { user, logout } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[#353535]/50 rounded-lg">
      <span className="material-symbols-outlined text-base text-[#41ffaf]">account_circle</span>
      <p className="text-sm text-white font-medium">{user.name || user.email}</p>
      <button
        onClick={() => {
          logout();
          router.push('/');
        }}
        className="ml-2 flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <span className="material-symbols-outlined text-base">logout</span>
      </button>
    </div>
  );
}
