import type { ReactNode } from "react";

interface AdminPageHeaderProps {
  eyebrow?: string;
  eyebrowIcon?: ReactNode;
  title: string;
  description?: string;
  extra?: ReactNode;
}

export default function AdminPageHeader({
  eyebrow,
  eyebrowIcon,
  title,
  description,
  extra,
}: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        {eyebrow && (
          <div className="flex items-center gap-1.5 text-[#0F766E] text-[11px] font-bold uppercase tracking-wider mb-1">
            {eyebrowIcon && <span className="text-sm">{eyebrowIcon}</span>}
            <span>{eyebrow}</span>
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#163B40] tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-[#64748B] mt-1 max-w-3xl leading-relaxed font-medium">
            {description}
          </p>
        )}
      </div>

      {extra && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{extra}</div>}
    </div>
  );
}
