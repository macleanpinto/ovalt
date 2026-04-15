'use client';

import { useEffect, useState } from 'react';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

interface AlertProps {
  type: AlertType;
  message: string;
  onClose: () => void;
  duration?: number;
}

export default function Alert({ type, message, onClose, duration = 5000 }: AlertProps) {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 300); // Wait for exit animation
  };

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(handleClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  const colors = {
    success: 'bg-green-500/10 border-green-500/30 text-green-400',
    error: 'bg-red-500/10 border-red-500/30 text-red-400',
    warning: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-400'
  };

  const icons = {
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info'
  };

  return (
    <div
      className={`${colors[type]} border rounded-xl p-4 shadow-2xl backdrop-blur-xl flex items-start gap-3 min-w-[320px] max-w-[480px] transition-all duration-300 ease-out ${
        isExiting ? 'animate-slide-out-right' : 'animate-slide-in-right'
      }`}
      role="alert"
    >
      <span className="material-symbols-outlined text-xl mt-0.5 flex-shrink-0">
        {icons[type]}
      </span>
      <div className="flex-1 text-sm leading-relaxed whitespace-pre-wrap">
        {message}
      </div>
      <button
        onClick={handleClose}
        className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
        aria-label="Close notification"
      >
        <span className="material-symbols-outlined text-lg">close</span>
      </button>
    </div>
  );
}
