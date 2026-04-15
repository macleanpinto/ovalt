type BrandLogoProps = {
  /** Pass through for LCP on the home page */
  priority?: boolean;
  className?: string;
};

/**
 * Tag Relay-style mark (`/ovalt.svg`: tag, arrow, server node) + wordmark.
 */
export function BrandLogo({ priority, className }: BrandLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/ovalt.svg"
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 shrink-0"
        fetchPriority={priority ? "high" : undefined}
      />
      <span className="font-bold tracking-tight text-[1.375rem] leading-none text-[#41ffaf] headline-font">
        Ovalt
      </span>
    </span>
  );
}
