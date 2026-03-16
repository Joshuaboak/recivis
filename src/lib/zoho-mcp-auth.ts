/**
 * Zoho MCP OAuth 2.0 Client
 * Handles dynamic client registration, authorization, and token management
 * for the Zoho MCP endpoint. Persists tokens to disk so they survive
 * server restarts and HMR.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MCP_BASE = 'https://civilsurveyapplicationszohomcp-7006508204.zohomcp.com.au';
const OAUTH_BASE = 'https://mcp.zoho.com.au/baas/mcp/v1/oauth/edf972cb1c51996df4e9d66549c6b595/2522000000011035';
const AUTH_ENDPOINT = 'https://mcp.zoho.com.au/mcp-client/edf972cb1c51996df4e9d66549c6b595/2522000000011035/oauth';

// Persist tokens to a file in the project root (gitignored via .env* pattern)
const TOKEN_FILE = path.join(process.cwd(), '.mcp-tokens.json');

interface OAuthClient {
  clientId: string;
  redirectUri: string;
}

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface PersistedData {
  client?: OAuthClient;
  tokens?: TokenData;
}

// In-memory cache
let oauthClient: OAuthClient | null = null;
let tokenData: TokenData | null = null;
let pendingVerifiers: Map<string, string> = new Map();

/** Load persisted tokens from disk. */
function loadFromDisk(): void {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const raw = fs.readFileSync(TOKEN_FILE, 'utf-8');
      const data: PersistedData = JSON.parse(raw);
      if (data.client) oauthClient = data.client;
      if (data.tokens) tokenData = data.tokens;
    }
  } catch {
    // Ignore — file may not exist or be corrupt
  }
}

/** Save current state to disk. */
function saveToDisk(): void {
  try {
    const data: PersistedData = {};
    if (oauthClient) data.client = oauthClient;
    if (tokenData) data.tokens = tokenData;
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
  } catch {
    // Non-critical — tokens still work in memory
  }
}

// Load on module init
loadFromDisk();

/**
 * Register a dynamic OAuth client with the MCP server.
 */
export async function registerClient(redirectUri: string): Promise<OAuthClient> {
  if (oauthClient && oauthClient.redirectUri === redirectUri) {
    return oauthClient;
  }

  const res = await fetch(`${OAUTH_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'ReCivis',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });

  if (!res.ok) {
    throw new Error(`Client registration failed: ${res.status}`);
  }

  const data = await res.json();
  oauthClient = {
    clientId: data.client_id,
    redirectUri: redirectUri,
  };

  saveToDisk();
  return oauthClient;
}

/**
 * Generate PKCE code verifier and challenge.
 */
function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

/**
 * Build the authorization URL for the user to visit.
 */
export async function getAuthorizationUrl(appBaseUrl: string): Promise<string> {
  const redirectUri = `${appBaseUrl}/api/auth/mcp-callback`;
  const client = await registerClient(redirectUri);

  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString('hex');

  pendingVerifiers.set(state, verifier);

  const scopes = [
    'ZohoCRM.modules.ALL',
    'ZohoCRM.settings.ALL',
    'ZohoCRM.users.READ',
    'ZohoCRM.org.READ',
    'ZohoCRM.settings.variables.ALL',
    'ZohoMCP.tool.execute',
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: redirectUri,
    state: state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: scopes,
  });

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCode(code: string, state: string, appBaseUrl: string): Promise<TokenData> {
  const verifier = pendingVerifiers.get(state);
  if (!verifier) {
    throw new Error('Invalid state parameter — PKCE verifier not found');
  }
  pendingVerifiers.delete(state);

  const redirectUri = `${appBaseUrl}/api/auth/mcp-callback`;
  const client = await registerClient(redirectUri);

  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      client_id: client.clientId,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token exchange failed: ${res.status} — ${errText}`);
  }

  const data = await res.json();
  tokenData = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };

  saveToDisk();
  return tokenData;
}

/**
 * Refresh the access token using the refresh token.
 */
async function refreshAccessToken(): Promise<string> {
  if (!tokenData?.refreshToken || !oauthClient) {
    throw new Error('NOT_AUTHENTICATED');
  }

  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenData.refreshToken,
      client_id: oauthClient.clientId,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    tokenData = null;
    saveToDisk();
    throw new Error(`Token refresh failed: ${res.status} — ${errText}`);
  }

  const data = await res.json();
  tokenData = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokenData.refreshToken,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };

  saveToDisk();
  return tokenData.accessToken;
}

/**
 * Get a valid access token, refreshing if needed.
 */
export async function getAccessToken(): Promise<string> {
  // Reload from disk in case another process updated tokens
  if (!tokenData) loadFromDisk();

  if (!tokenData) {
    throw new Error('NOT_AUTHENTICATED');
  }

  // Refresh if expires within 60 seconds
  if (Date.now() > tokenData.expiresAt - 60000) {
    return refreshAccessToken();
  }

  return tokenData.accessToken;
}

/**
 * Check if we have valid tokens.
 */
export function isAuthenticated(): boolean {
  if (!tokenData) loadFromDisk();
  return tokenData !== null;
}

/**
 * Get the MCP endpoint URL (includes the connection key).
 */
export function getMcpEndpoint(): string {
  const key = process.env.ZOHO_MCP_KEY || 'ed4cf1a7840312505eceea4d452670f1';
  return `${MCP_BASE}/mcp/message?key=${key}`;
}
