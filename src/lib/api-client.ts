type ApiPayload = Record<string, unknown>;

export async function readApiResponse(response: Response): Promise<ApiPayload> {
  const fallback = response.ok ? "The server returned an invalid response." : `Request failed with HTTP ${response.status}.`;
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const body = await response.text();

  if (!body.trim()) throw new Error(response.ok ? fallback : `${fallback} The response body was empty.`);
  if (!contentType.includes("application/json")) throw new Error(`${fallback} Expected JSON but received ${contentType || "an unknown content type"}.`);

  let payload: ApiPayload;
  try {
    payload = JSON.parse(body) as ApiPayload;
  } catch {
    throw new Error(`${fallback} The response contained malformed JSON.`);
  }

  if (!response.ok) {
    const structured=typeof payload.error==="object"&&payload.error!==null&&"message" in payload.error&&typeof payload.error.message==="string"?payload.error.message:null;
    throw new Error(typeof payload.error === "string" ? payload.error : structured ?? fallback);
  }
  return payload;
}
