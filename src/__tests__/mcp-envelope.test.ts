/**
 * Tests for unwrapping Zoho's MCP response wrapper.
 *
 * Every portal parser reads `parsed.data` as the record array. If the wrapper
 * gets through, partners lose access to their own customers' contacts and the
 * chat's read filter stops filtering.
 */
import { describe, it, expect } from 'vitest';
import { unwrapZohoEnvelope } from '@/lib/mcp-envelope';

const record = { id: '1', Reseller: { id: 'res-1' } };

function wrap(body: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(body) }] };
}

function firstText(result: unknown) {
  return JSON.parse((result as { content: Array<{ text: string }> }).content[0].text);
}

describe('unwrapZohoEnvelope', () => {
  it('strips the status/headers wrapper down to the CRM body', () => {
    const result = unwrapZohoEnvelope(
      wrap({ status: 'success', headers: {}, data: { data: [record], info: { more_records: false } } })
    );
    const body = firstText(result);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toEqual(record);
    expect(body.info.more_records).toBe(false);
  });

  it('leaves an already-flat CRM body alone', () => {
    const flat = { data: [record], info: { page: 1 } };
    expect(firstText(unwrapZohoEnvelope(wrap(flat)))).toEqual(flat);
  });

  it('leaves non-JSON text and missing content alone', () => {
    const text = { content: [{ type: 'text', text: 'not json' }] };
    expect(unwrapZohoEnvelope(text)).toEqual(text);
    expect(unwrapZohoEnvelope(null)).toBeNull();
  });
});
