import { describe, expect, it } from "vitest";
import { readApiResponse } from "@/lib/api-client";

describe("readApiResponse", () => {
  it("returns valid JSON for a successful response", async () => {
    await expect(readApiResponse(new Response('{"id":"scan-1"}', { status: 202, headers: { "Content-Type": "application/json" } }))).resolves.toEqual({ id: "scan-1" });
  });

  it("uses a JSON API error message", async () => {
    await expect(readApiResponse(new Response('{"error":"Configuration is missing."}', { status: 503, headers: { "Content-Type": "application/json" } }))).rejects.toThrow("Configuration is missing.");
  });

  it("uses a structured JSON API error message", async () => {
    await expect(readApiResponse(new Response('{"error":{"code":"AI_DISABLED","message":"Optional AI analysis is disabled."}}', { status: 403, headers: { "Content-Type": "application/json" } }))).rejects.toThrow("Optional AI analysis is disabled.");
  });

  it("reports an empty error response without parsing it", async () => {
    await expect(readApiResponse(new Response(null, { status: 500 }))).rejects.toThrow("response body was empty");
  });

  it("rejects a non-JSON response before parsing", async () => {
    await expect(readApiResponse(new Response("Internal Server Error", { status: 500, headers: { "Content-Type": "text/plain" } }))).rejects.toThrow("Expected JSON");
  });

  it("reports malformed JSON", async () => {
    await expect(readApiResponse(new Response("{", { status: 500, headers: { "Content-Type": "application/json" } }))).rejects.toThrow("malformed JSON");
  });
});
