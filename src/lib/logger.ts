/**
 * ReCivis Logger
 * Structured logging for API calls, MCP tool execution, and AI interactions.
 * Logs are stored in memory (last 500 entries) and written to .recivis-logs.json.
 *
 * Uses a debounced async write pattern:
 * - Log entries are buffered in memory.
 * - The buffer is flushed to disk every 2 seconds OR when it exceeds 50 entries,
 *   whichever comes first. This avoids blocking the event loop with synchronous
 *   writes on every single log call while still keeping disk state reasonably fresh.
 */

import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), '.recivis-logs.json');
const MAX_ENTRIES = 500;

/** Number of buffered entries that triggers an immediate flush. */
const FLUSH_THRESHOLD = 50;

/** Interval (ms) between scheduled flushes. */
const FLUSH_INTERVAL_MS = 2000;

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: 'api' | 'mcp' | 'ai' | 'tool' | 'auth' | 'file';
  message: string;
  data?: Record<string, unknown>;
  durationMs?: number;
}

let logs: LogEntry[] = [];

/**
 * Buffer of entries added since the last flush.
 * Checked on each log() call and on the periodic timer.
 */
let pendingWrites = 0;

/** Whether a flush is already scheduled (debounce guard). */
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Whether an async write is currently in progress (prevents overlapping writes). */
let writing = false;

// Load existing logs on startup
try {
  if (fs.existsSync(LOG_FILE)) {
    const raw = fs.readFileSync(LOG_FILE, 'utf-8');
    logs = JSON.parse(raw);
  }
} catch {
  logs = [];
}

/**
 * Flush buffered log entries to disk asynchronously.
 * Trims to MAX_ENTRIES before writing. Silently catches write errors
 * since logging is non-critical and must never crash the app.
 */
async function flushToDisk() {
  if (writing || pendingWrites === 0) return;
  writing = true;
  pendingWrites = 0;

  try {
    // Trim to the most recent MAX_ENTRIES
    if (logs.length > MAX_ENTRIES) {
      logs = logs.slice(-MAX_ENTRIES);
    }
    await fs.promises.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));
  } catch {
    // Non-critical — disk write failure should never propagate
  } finally {
    writing = false;
  }
}

/**
 * Schedule a flush if one is not already pending.
 * If the buffer has grown past FLUSH_THRESHOLD, flush immediately instead.
 */
function scheduleFlush() {
  if (pendingWrites >= FLUSH_THRESHOLD) {
    // Buffer is large — flush right away
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    flushToDisk();
    return;
  }

  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushToDisk();
    }, FLUSH_INTERVAL_MS);
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
  pendingWrites++;
  scheduleFlush();

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
  pendingWrites++;
  scheduleFlush();
}
