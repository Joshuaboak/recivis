/**
 * ReCivis Logger
 * Structured logging for API calls, MCP tool execution, and AI interactions.
 * Logs are stored in memory (last 500 entries) and written to .recivis-logs.json.
 */

import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), '.recivis-logs.json');
const MAX_ENTRIES = 500;

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: 'api' | 'mcp' | 'ai' | 'tool' | 'auth' | 'file';
  message: string;
  data?: Record<string, unknown>;
  durationMs?: number;
}

let logs: LogEntry[] = [];

// Load existing logs on startup
try {
  if (fs.existsSync(LOG_FILE)) {
    const raw = fs.readFileSync(LOG_FILE, 'utf-8');
    logs = JSON.parse(raw);
  }
} catch {
  logs = [];
}

function persist() {
  try {
    // Keep only last MAX_ENTRIES
    if (logs.length > MAX_ENTRIES) {
      logs = logs.slice(-MAX_ENTRIES);
    }
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
  } catch {
    // Non-critical
  }
}

export function log(
  level: LogEntry['level'],
  category: LogEntry['category'],
  message: string,
  data?: Record<string, unknown>,
  durationMs?: number
) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    ...(data && { data }),
    ...(durationMs !== undefined && { durationMs }),
  };

  logs.push(entry);
  persist();

  // Also console log for dev server
  const prefix = `[${category.toUpperCase()}]`;
  const dur = durationMs ? ` (${durationMs}ms)` : '';
  if (level === 'error') {
    console.error(`${prefix} ${message}${dur}`, data || '');
  } else if (level === 'warn') {
    console.warn(`${prefix} ${message}${dur}`, data || '');
  } else {
    console.log(`${prefix} ${message}${dur}`, data ? JSON.stringify(data).slice(0, 200) : '');
  }
}

export function getLogs(count = 50, category?: string): LogEntry[] {
  let filtered = logs;
  if (category) {
    filtered = logs.filter((l) => l.category === category);
  }
  return filtered.slice(-count);
}

export function clearLogs() {
  logs = [];
  persist();
}
