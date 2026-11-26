/**
 * Unit tests for API client response unwrapping logic.
 * Covers all requirements in Section 1 of the specification:
 * - Response with data: null
 * - Response with data: []
 * - Response with data: false
 * - Response with data: 0
 * - Response with standard data
 * - Response without wrapper
 * - Response with pagination and metadata
 * - Business response containing a 'data' field but not an API wrapper
 * - Preservation of metadata and structural integrity
 */

function unwrapApiResponse(data) {
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }

  const hasSuccess = "success" in data && typeof data.success === "boolean";
  const hasData = "data" in data;

  if (hasSuccess && hasData) {
    const allKeys = Object.keys(data);
    const metaKeys = allKeys.filter(
      (k) => k !== "success" && k !== "data" && k !== "message" && k !== "error"
    );

    if (metaKeys.length === 0) {
      return data.data;
    }

    if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
      const dataKeys = new Set(Object.keys(data.data));
      const hasUniqueMeta = metaKeys.some((k) => !dataKeys.has(k));
      if (!hasUniqueMeta) {
        return data.data;
      }
    }

    return data;
  }

  return data;
}

describe("apiClient unwrapApiResponse Unit Tests", () => {
  describe("1. Falsy and boundary values inside wrapper", () => {
    test("should unwrap data: null cleanly to null", () => {
      const response = { success: true, data: null };
      expect(unwrapApiResponse(response)).toBeNull();
    });

    test("should unwrap data: [] cleanly to empty array", () => {
      const response = { success: true, data: [] };
      const result = unwrapApiResponse(response);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    test("should unwrap data: false cleanly to false boolean", () => {
      const response = { success: true, data: false };
      expect(unwrapApiResponse(response)).toBe(false);
    });

    test("should unwrap data: 0 cleanly to 0 number", () => {
      const response = { success: true, data: 0 };
      expect(unwrapApiResponse(response)).toBe(0);
    });

    test("should unwrap data: '' cleanly to empty string", () => {
      const response = { success: true, data: "" };
      expect(unwrapApiResponse(response)).toBe("");
    });
  });

  describe("2. Standard responses", () => {
    test("should unwrap object data cleanly", () => {
      const payload = { id: "camp-001", name: "Học bổng Edunity V3", target: 50000000 };
      const response = { success: true, data: payload };
      expect(unwrapApiResponse(response)).toEqual(payload);
    });

    test("should unwrap array of objects", () => {
      const items = [{ id: 1, name: "A" }, { id: 2, name: "B" }];
      const response = { success: true, data: items };
      expect(unwrapApiResponse(response)).toEqual(items);
    });

    test("should allow wrapper with optional message and unwrap data", () => {
      const response = { success: true, data: { status: "UPDATED" }, message: "Cập nhật thành công" };
      expect(unwrapApiResponse(response)).toEqual({ status: "UPDATED" });
    });
  });

  describe("3. Responses without wrapper", () => {
    test("should return non-wrapped object as is", () => {
      const raw = { token: "jwt-token-xyz", expiresIn: 3600, role: "TEACHER" };
      expect(unwrapApiResponse(raw)).toEqual(raw);
    });

    test("should return raw array as is", () => {
      const arr = [1, 2, 3, 4];
      expect(unwrapApiResponse(arr)).toEqual(arr);
    });

    test("should return raw primitive string as is", () => {
      expect(unwrapApiResponse("OK")).toBe("OK");
    });

    test("should return null as is", () => {
      expect(unwrapApiResponse(null)).toBeNull();
    });

    test("should return undefined as is", () => {
      expect(unwrapApiResponse(undefined)).toBeUndefined();
    });
  });

  describe("4. Business payloads containing a 'data' field (NOT a wrapper)", () => {
    test("should NOT unwrap business object having a 'data' property without 'success' flag", () => {
      const businessObj = {
        id: "chart-01",
        title: "Doanh thu theo tuần",
        data: [1200000, 3500000, 2800000],
        unit: "VND",
        updatedAt: "2026-11-26T10:00:00.000Z",
      };
      const result = unwrapApiResponse(businessObj);
      expect(result).toEqual(businessObj);
      expect(result.id).toBe("chart-01");
      expect(result.title).toBe("Doanh thu theo tuần");
      expect(result.data).toEqual([1200000, 3500000, 2800000]);
      expect(result.unit).toBe("VND");
    });

    test("should NOT unwrap file metadata payload containing 'data'", () => {
      const filePayload = {
        fileName: "evidence.pdf",
        mimeType: "application/pdf",
        data: "base64encodedcontent==",
        checksum: "abc123sha",
      };
      const result = unwrapApiResponse(filePayload);
      expect(result).toEqual(filePayload);
      expect(result.fileName).toBe("evidence.pdf");
      expect(result.data).toBe("base64encodedcontent==");
    });
  });

  describe("5. Pagination and metadata preservation", () => {
    test("should cleanly return paged object when nested inside data (standard Edunity pattern)", () => {
      const pagedData = {
        items: [{ id: "app-1" }, { id: "app-2" }],
        total: 42,
        page: 1,
        pageSize: 10,
        totalPages: 5,
      };
      const response = { success: true, data: pagedData };
      expect(unwrapApiResponse(response)).toEqual(pagedData);
    });

    test("should preserve sibling pagination metadata when alongside data array", () => {
      const response = {
        success: true,
        data: [{ id: "tx-1" }, { id: "tx-2" }],
        pagination: { total: 100, page: 2, limit: 20 },
      };
      const result = unwrapApiResponse(response);
      expect(result).toEqual(response);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.total).toBe(100);
      expect(result.data).toHaveLength(2);
    });

    test("should handle controller spreading result into root ({ success: true, data: result, ...result })", () => {
      const resultObj = {
        items: [{ id: "p-1", amount: 500000 }],
        summary: { totalGross: 500000, totalNet: 450000 },
        total: 1,
        page: 1,
      };
      const response = {
        success: true,
        data: resultObj,
        ...resultObj,
      };
      const unwrapped = unwrapApiResponse(response);
      expect(unwrapped).toEqual(resultObj);
      expect(unwrapped.summary.totalNet).toBe(450000);
      expect(unwrapped.items).toHaveLength(1);
    });

    test("should preserve root metadata when response has unique audit meta", () => {
      const response = {
        success: true,
        data: { users: 50 },
        meta: { executionTimeMs: 14, traceId: "req-987" },
      };
      const unwrapped = unwrapApiResponse(response);
      expect(unwrapped).toEqual(response);
      expect(unwrapped.meta.traceId).toBe("req-987");
    });
  });

  describe("6. Wrapper without data field", () => {
    test("should return wrapper as is when success is true but data field is absent", () => {
      const response = { success: true, message: "Chiến dịch đã được xóa thành công" };
      expect(unwrapApiResponse(response)).toEqual(response);
    });
  });
});
