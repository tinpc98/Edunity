import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Breadcrumb } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { ROUTES } from "../../routes/routePaths";

interface AdminPageHeroProps {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  /** Current page label in the breadcrumb (defaults to title). */
  crumb?: string;
  /** Optional middle crumbs, e.g. a parent list page with a link. */
  parents?: { label: string; to?: string }[];
  extra?: ReactNode;
}

/** Breadcrumb + header card used by admin management pages (style of AdminCategoriesPage). */
export default function AdminPageHero({ icon, title, description, crumb, parents = [], extra }: AdminPageHeroProps) {
  return (
    <>
      <Breadcrumb
        className="text-sm"
        items={[
          {
            title: (
              <Link to={ROUTES.ADMIN.HOME} className="inline-flex items-center gap-1.5">
                <HomeOutlined /> Tổng quan
              </Link>
            ),
          },
          ...parents.map((p) => ({ title: p.to ? <Link to={p.to}>{p.label}</Link> : p.label })),
          { title: <span className="font-semibold text-[#0F766E]">{crumb || title}</span> },
        ]}
      />

      <div className="bg-white rounded-2xl border border-[#D6E5E2] p-5 sm:p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-12 h-12 shrink-0 rounded-xl bg-[#E5F5F1] text-[#0F766E] flex items-center justify-center text-xl">
            {icon}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-[#163B40] leading-snug m-0">{title}</h1>
            {description && (
              <p className="text-sm text-[#64748B] leading-relaxed mt-1 mb-0">{description}</p>
            )}
          </div>
        </div>
        {extra && <div className="flex flex-wrap items-center gap-2 shrink-0">{extra}</div>}
      </div>
    </>
  );
}
