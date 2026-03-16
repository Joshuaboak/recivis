const ZOHO_BASE = 'https://www.zohoapis.com.au/crm/v7';

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

export async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Zoho OAuth credentials not configured');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(`https://accounts.zoho.com.au/oauth/v2/token?${params}`, {
    method: 'POST',
  });

  if (!res.ok) {
    throw new Error(`Zoho token refresh failed: ${res.status}`);
  }

  const data = await res.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };

  return tokenCache.accessToken;
}

export async function zohoRequest(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>
): Promise<unknown> {
  const token = await getAccessToken();
  const url = new URL(`${ZOHO_BASE}${path}`);

  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url.toString(), options);

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Zoho API error ${res.status}: ${errorText}`);
  }

  return res.json();
}

// Zoho CRM tool implementations for AI
export const zohoTools = {
  async searchRecords(module: string, criteria: string, fields: string[]): Promise<unknown> {
    const params: Record<string, string> = {
      criteria: `(${criteria})`,
      fields: fields.join(','),
    };
    return zohoRequest('GET', `/${module}/search`, undefined, params);
  },

  async getRecord(module: string, id: string, fields?: string[]): Promise<unknown> {
    const params: Record<string, string> = {};
    if (fields) params.fields = fields.join(',');
    return zohoRequest('GET', `/${module}/${id}`, undefined, params);
  },

  async getRelatedRecords(
    parentModule: string,
    parentId: string,
    relatedList: string,
    fields?: string[]
  ): Promise<unknown> {
    const params: Record<string, string> = {};
    if (fields) params.fields = fields.join(',');
    return zohoRequest(
      'GET',
      `/${parentModule}/${parentId}/${relatedList}`,
      undefined,
      params
    );
  },

  async createRecords(module: string, records: unknown[]): Promise<unknown> {
    return zohoRequest('POST', `/${module}`, {
      data: records,
      trigger: ['workflow'],
    });
  },

  async updateRecords(
    module: string,
    records: unknown[],
    trigger?: string[]
  ): Promise<unknown> {
    return zohoRequest('PUT', `/${module}`, {
      data: records,
      trigger: trigger || [],
    });
  },

  async getOrgVariable(variableName: string): Promise<unknown> {
    return zohoRequest('GET', `/settings/variables`, undefined, {
      group: 'General',
    });
  },

  async searchByWord(module: string, word: string, fields: string[]): Promise<unknown> {
    const params: Record<string, string> = {
      word: word,
      fields: fields.join(','),
    };
    return zohoRequest('GET', `/${module}/search`, undefined, params);
  },

  async callFunction(functionName: string, args: Record<string, string>): Promise<unknown> {
    const url = `https://www.zohoapis.com.au/crm/v2/functions/${functionName}/actions/execute`;
    const token = await getAccessToken();
    const params = new URLSearchParams({
      auth_type: 'apikey',
      zapikey: process.env.ZOHO_API_KEY || '',
      arguments: JSON.stringify(args),
    });

    const res = await fetch(`${url}?${params}`, {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    return res.json();
  },
};
