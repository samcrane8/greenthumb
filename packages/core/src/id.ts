/** Stable, collision-resistant ids for models and their parts. */
export function newId(prefix: string): string {
  const webcrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const uuid =
    typeof webcrypto?.randomUUID === "function" ? webcrypto.randomUUID() : fallbackUuid();
  return `${prefix}_${uuid.replace(/-/g, "").slice(0, 12)}`;
}

// Only used where WebCrypto is unavailable; not cryptographically strong.
function fallbackUuid(): string {
  let out = "";
  for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}
