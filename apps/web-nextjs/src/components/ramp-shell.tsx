import type { ReactNode } from 'react';

/** Ramp-style page width + horizontal padding (reference: ramp.com marketing shell). */
export function RampMain({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <main className={`mx-auto w-full max-w-7xl px-5 pb-20 pt-10 sm:px-6 lg:px-8 lg:pb-28 lg:pt-14 ${className}`}>
      {children}
    </main>
  );
}

/** Eyebrow + large title + muted description row (Ramp hero / interior pages). */
export function RampPageHero({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-10 md:mb-14">
      {eyebrow ? (
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#41ffaf]/90">{eyebrow}</p>
      ) : null}
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl">{title}</h1>
          {description ? (
            <p className="mt-4 text-pretty text-lg leading-relaxed text-zinc-400 md:text-xl">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Card surface: soft border, large radius (Ramp “product card” feel). */
export function RampPanel({
  children,
  className = '',
  padding = 'p-6 md:p-8',
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.08] bg-[#1c1b1b]/90 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] ${padding} ${className}`}
    >
      {children}
    </div>
  );
}
