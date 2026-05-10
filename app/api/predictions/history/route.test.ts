import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/predictions/history", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const req = new Request("http://localhost/api/predictions/history", {
      method: "GET",
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Missing Authorization header" });
  });

  it("returns 401 when Authorization header does not start with Bearer", async () => {
    const req = new Request("http://localhost/api/predictions/history", {
      method: "GET",
      headers: { Authorization: "Basic some-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
