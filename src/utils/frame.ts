// Sandboxed frames without `allow-same-origin` have an opaque ("null") origin.
// The Splits connect dialog keys sites by origin and can't attribute requests
// from these, so the content scripts skip them.
export function hasOpaqueOrigin(): boolean {
  return window.origin === "null";
}
