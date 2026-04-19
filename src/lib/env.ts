/**
 * Environment variable helpers — fail loudly if required vars are missing.
 */

export function getZohoApiKey(): string {
  const key = process.env.ZOHO_API_KEY;
  if (!key) throw new Error('ZOHO_API_KEY environment variable is not set');
  return key;
}

export function getZohoTokenUrl(): string {
  const key = getZohoApiKey();
  return `https://www.zohoapis.com.au/crm/v7/functions/getresellerzohotoken/actions/execute?auth_type=apikey&zapikey=${key}&arguments=%7B%22resellerName%22%3A%22Civil%20Survey%20Applications%22%7D`;
}

const DEV_JWT_SECRET_FALLBACK = 'recivis-dev-secret-change-in-production';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is not set — refusing to start in production with the dev fallback key');
    }
    return DEV_JWT_SECRET_FALLBACK;
  }
  return secret;
}
