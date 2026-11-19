import type { ReactNode } from "react";

interface AdminSectionCardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
}

export default function AdminSectionCard({
  title,
  subtitle,
  icon,
  badge,
  extra,
  children,
  className = "",
  bodyClassName = "",
  noPadding = false,
}: AdminSectionCardProps) {
  const hasHeader = Boolean(title || extra || icon || badge);

  return (
    <div
      className={`bg-white rounded-2xl border border-[#D6E5E2] shadow-[0_2px_8px_rgba(15,118,110,0.04)] overflow-hidden transition-all duration-200 ${className}`}
    >
      {hasHeader && (
        <div className="px-5 sm:px-6 py-4 border-b border-[#D6E5E2] bg-[#F0F8F6] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {icon && (
              <span className="w-8 h-8 rounded-lg bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4] flex items-center justify-center text-base shrink-0 shadow-2xs">
                {icon}
              </span>
            )}
            <div>
              <div className="flex items-center gap-2">
                {typeof title === "string" ? (
                  <h3 className="text-base font-bold text-[#163B40] tracking-tight leading-none">
                    {title}
                  </h3>
                ) : (
                  title
                )}
                {badge}
              </div>
              {subtitle && (
                <p className="text-xs text-[#64748B] mt-1 leading-tight font-medium">{subtitle}</p>
              )}
            </div>
          </div>

          {extra && <div className="flex items-center gap-2">{extra}</div>}
        </div>
      )}

      <div className={noPadding ? bodyClassName : `p-5 sm:p-6 ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
}
