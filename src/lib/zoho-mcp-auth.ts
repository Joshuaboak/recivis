/**
 * Zoho MCP Client — Preauthorized endpoint.
 * No OAuth needed. Just the MCP URL with key.
 */

const MCP_URL = process.env.ZOHO_MCP_URL ||
  'https://recivis-7006508204.zohomcp.com.au/mcp/message?key=4b0f3487716ef12a54e1ee9612ca1f9c';

export function getMcpEndpoint(): string {
  return MCP_URL;
}

export function isAuthenticated(): boolean {
  return true; // Always authenticated — preauthorized key
}

export async function getAccessToken(): Promise<string | null> {
  return null; // No bearer token needed
}
