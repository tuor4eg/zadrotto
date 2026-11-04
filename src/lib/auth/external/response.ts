// Bound response consumption before parsing; never include remote bodies in errors.
export async function boundedOAuthResponse(response: Response, maxBytes = 65_536) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing provider response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new Error("Provider response too large");
      chunks.push(part.value);
    }
  } finally { await reader.cancel(); }
  return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
}
