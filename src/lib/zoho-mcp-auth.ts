/**
 * Zoho MCP Client — Preauthorized endpoint.
 * No OAuth needed. Just the MCP URL with key.
 */

const MCP_URL = process.env.ZOHO_MCP_URL ||
  'https://recivis-7006508204.zohomcp.com.au/mcp/5c9afad5b4454d6f85f133157f17601e/message';

export function getMcpEndpoint(): string {
  return MCP_URL;
}

export function isAuthenticated(): boolean {
  return true; // Always authenticated — preauthorized key
}

export async function getAccessToken(): Promise<string | null> {
  return null; // No bearer token needed
}
