import { apiClient } from "../api/apiClient";
import type {
  PricingPolicy,
  PricingPolicyListParams,
  PricingPolicyPayload,
} from "../types/courseGovernance";
import type { PagedResult } from "../types/catalog";

interface ApiPricingPolicy extends Omit<PricingPolicy, "id" | "minPrice" | "maxPrice"> {
  id?: string;
  _id?: string;
  minPrice: string | number | { $numberDecimal?: string };
  maxPrice: string | number | { $numberDecimal?: string };
}

function adaptPolicy(raw: ApiPricingPolicy): PricingPolicy {
  const id = raw.id || raw._id;
  if (!id) throw new Error("The API returned a pricing policy without an id.");
  const decimalString = (value: ApiPricingPolicy["minPrice"]) =>
    typeof value === "object" ? value.$numberDecimal || "" : String(value);
  return {
    ...raw,
    id,
    minPrice: decimalString(raw.minPrice),
    maxPrice: decimalString(raw.maxPrice),
  };
}

function buildQuery(params: PricingPolicyListParams): string {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.scopeType) query.set("scopeType", params.scopeType);
  if (params.status) query.set("status", params.status);
  const value = query.toString();
  return value ? `?${value}` : "";
}

class CoursePricingPolicyService {
  async list(params: PricingPolicyListParams = {}): Promise<PagedResult<PricingPolicy>> {
    const raw = await apiClient<{
      items: ApiPricingPolicy[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/admin/pricing-policies${buildQuery(params)}`);
    return { ...raw, items: raw.items.map(adaptPolicy) };
  }

  async get(id: string): Promise<PricingPolicy> {
    return adaptPolicy(await apiClient<ApiPricingPolicy>(`/admin/pricing-policies/${id}`));
  }

  async create(payload: PricingPolicyPayload): Promise<PricingPolicy> {
    return adaptPolicy(
      await apiClient<ApiPricingPolicy>("/admin/pricing-policies", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
  }

  async createVersion(id: string, payload: PricingPolicyPayload): Promise<PricingPolicy> {
    return adaptPolicy(
      await apiClient<ApiPricingPolicy>(`/admin/pricing-policies/${id}/versions`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
  }

  async activate(id: string, effectiveFrom?: string): Promise<PricingPolicy> {
    return adaptPolicy(
      await apiClient<ApiPricingPolicy>(`/admin/pricing-policies/${id}/activate`, {
        method: "POST",
        body: JSON.stringify(effectiveFrom ? { effectiveFrom } : {}),
      })
    );
  }
}

export const coursePricingPolicyService = new CoursePricingPolicyService();
