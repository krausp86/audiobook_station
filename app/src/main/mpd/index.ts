import { MpdClient } from './client';

let client: MpdClient | null = null;

/**
 * Get or create the singleton MPD client.
 * Connects on first call, reuses connection on subsequent calls.
 * @returns connected MpdClient instance
 * @throws Error if connection fails
 */
export async function getMpd(): Promise<MpdClient> {
  if (client) return client;
  const c = new MpdClient();
  await c.connect();
  client = c;
  return c;
}
