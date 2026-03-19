/**
 * zoho-mcp-auth.ts — MCP endpoint configuration for Zoho CRM.
 *
 * Uses a preauthorized MCP URL with an embedded API key, so no OAuth
 * token exchange is required. The URL is baked into Zoho's MCP provisioning
 * and grants scoped access to the CSA Zoho CRM instance.
 *
 * The ZOHO_MCP_URL env var can override the default for dev/staging environments.
 */

const MCP_URL = process.env.ZOHO_MCP_URL ||
  'https://recivis-7006508204.zohomcp.com.au/mcp/5c9afad5b4454d6f85f133157f17601e/message';

/** Returns the full MCP endpoint URL (with embedded auth key). */
export function getMcpEndpoint(): string {
  return MCP_URL;
}

/** Always true — the preauthorized key is always valid. */
export function isAuthenticated(): boolean {
  return true;
}

/** Returns null — no bearer token needed with preauthorized MCP. */
export async function getAccessToken(): Promise<string | null> {
  return null;
}
