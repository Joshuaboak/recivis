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

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'recivis-dev-secret-change-in-production';
}
