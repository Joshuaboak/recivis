'use client';

import { motion } from 'framer-motion';
import { Bot, User, ExternalLink, CheckCircle, Pencil, X } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import LineItemForm from './LineItemForm';
import DataForm, { parseFieldList } from './DataForm';

type PromptType = 'confirm_create' | 'yes_no_proceed' | 'yes_no' | null;

/** Detect what kind of actionable prompt is at the end of the message */
function detectPromptType(content: string): PromptType {
  const lower = content.toLowerCase();
  const tail = lower.slice(-300);

  // Invoice creation confirmation
  if (
    tail.includes('does this look correct') ||
    tail.includes('confirm to create') ||
    tail.includes('create this invoice') ||
    tail.includes('ready to create') ||
    tail.includes('confirm?') ||
    tail.includes('(y/n)')
  ) {
    return 'confirm_create';
  }

  // Proceed / continue type questions
  if (
    tail.includes('shall we proceed') ||
    tail.includes('shall i proceed') ||
    tail.includes('would you like to proceed') ||
    tail.includes('proceed with') ||
    tail.includes('shall i continue') ||
    tail.includes('want to continue') ||
    tail.includes('move on to') ||
    tail.includes('go ahead')
  ) {
    return 'yes_no_proceed';
  }

  // Generic yes/no questions — must be specific binary questions, not open-ended
  if (
    tail.includes('is this correct?') ||
    tail.includes('is that correct?') ||
    tail.includes('is that right?') ||
    tail.includes('correct contact for') ||
    tail.includes('does that look right') ||
    tail.includes('sound right?') ||
    tail.includes('look good?') ||
    tail.includes('are you sure') ||
    tail.includes('add another line item') ||
    tail.includes('add another?')
  ) {
    return 'yes_no';
  }

  return null;
}

/** Detect if message contains a line item details prompt and extract defaults */
function detectLineItemPrompt(content: string): { quantity: number; startDate: string; endDate: string; price: string; currency: string } | null {
  const lower = content.toLowerCase();
  if (!(lower.includes('quantity') && lower.includes('start date') && lower.includes('price'))) {
    return null;
  }

  // Extract defaults from the message text
  const qtyMatch = content.match(/(?:default[:\s]*|Quantity[?:]*\s*\(default[:\s]*)\s*(\d+)/i);
  const startMatch = content.match(/(?:Start date|start)[?:]*\s*\(?default[^)]*?(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const endMatch = content.match(/(?:End date|end)[?:]*\s*\(?default[^)]*?(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const currMatch = content.match(/([€$£]|EUR|USD|AUD|GBP|NZD)/i);

  // Try multiple price patterns: "€1,850.00", "Unit Price: €1,850", "default: €1,850", "— €1,850.00"
  const pricePatterns = [
    /(?:Unit Price|List Price|list price)[:\s]*[€$£]?([\d,]+\.?\d*)/i,
    /(?:price|Price)[?:]*\s*\(?default[:\s]*[€$£]?([\d,]+\.?\d*)/i,
    /[—\-–]\s*[€$£]([\d,]+\.?\d*)/,
    /[€$£]([\d,]+\.?\d{2})/,
  ];
  let priceVal = '0';
  for (const pat of pricePatterns) {
    const m = content.match(pat);
    if (m?.[1]) {
      priceVal = m[1].replace(/,/g, '');
      break;
    }
  }

  const today = new Date();
  const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  const endDefault = new Date(today.getTime() + 364 * 24 * 60 * 60 * 1000);
  const endStr = `${String(endDefault.getDate()).padStart(2, '0')}/${String(endDefault.getMonth() + 1).padStart(2, '0')}/${endDefault.getFullYear()}`;

  let currSymbol = '€';
  if (currMatch) {
    const c = currMatch[1];
    if (c === '$' || c === 'USD' || c === 'AUD' || c === 'NZD') currSymbol = '$';
    else if (c === '£' || c === 'GBP') currSymbol = '£';
    else currSymbol = '€';
  }

  return {
    quantity: parseInt(qtyMatch?.[1] || '1'),
    startDate: startMatch?.[1] || todayStr,
    endDate: endMatch?.[1] || endStr,
    price: priceVal,
    currency: currSymbol,
  };
}

/** Get button config for each prompt type */
function getPromptButtons(type: PromptType): { primary: { label: string; message: string; icon: string }; secondary: { label: string; message: string; icon: string } } | null {
  switch (type) {
    case 'confirm_create':
      return {
        primary: { label: 'Confirm', message: 'Yes, create the invoice', icon: 'check' },
        secondary: { label: 'Edit', message: 'I need to make some changes', icon: 'edit' },
      };
    case 'yes_no_proceed':
      return {
        primary: { label: 'Yes, proceed', message: 'Yes, proceed', icon: 'check' },
        secondary: { label: 'No', message: 'No', icon: 'x' },
      };
    case 'yes_no':
      return {
        primary: { label: 'Yes', message: 'Yes', icon: 'check' },
        secondary: { label: 'No', message: 'No', icon: 'x' },
      };
    default:
      return null;
  }
}

interface ChatMessageProps {
  message: ChatMessage;
  index: number;
}

/**
 * Detect if a block of numbered lines looks like selectable options
 * (short lines, typically choices like "1. Civil Site Design (CSD)")
 */
function looksLikeOptions(items: string[]): boolean {
  if (items.length < 2 || items.length > 6) return false;
  const avgLen = items.reduce((s, l) => s + l.length, 0) / items.length;
  if (avgLen > 60) return false;

  // If items look like form field labels (data collection), NOT selectable options
  const fieldIndicators = /\b(name|email|address|country|phone|number|date|price|details|notes|account|contact|company|quantity)\b/i;
  const fieldCount = items.filter((item) => fieldIndicators.test(item)).length;
  if (fieldCount >= items.length * 0.5) return false; // 50%+ are field-like = not options

  return true;
}

function renderMarkdown(content: string, onOptionClick?: (text: string) => void) {
  const lines = content.split('\n');
  const elements: React.ReactElement[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table detection
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1]?.match(/^\|[\s\-:|]+\|/)) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(renderTable(tableLines, key++));
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={key++} className="text-base font-bold text-text-primary mt-3 mb-1">
          {renderInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={key++} className="text-lg font-bold text-text-primary mt-4 mb-1">
          {renderInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <div key={key++} className="border-l-4 border-csa-accent rounded-r-lg pl-4 py-2 my-2 bg-csa-accent/5">
          {quoteLines.map((ql, qi) => (
            <p key={qi} className="text-sm text-text-secondary">
              {renderInline(ql)}
            </p>
          ))}
        </div>
      );
      continue;
    }

    // List items
    if (line.match(/^[\-\*] /)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^[\-\*] /)) {
        listItems.push(lines[i].replace(/^[\-\*] /, ''));
        i++;
      }
      elements.push(
        <ul key={key++} className="space-y-1 my-2">
          {listItems.map((item, li) => (
            <li key={li} className="flex items-start gap-2 text-sm text-text-secondary">
              <span className="text-csa-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-csa-accent flex-shrink-0" />
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list — detect if these are clickable options
    if (line.match(/^\d+\.\s/)) {
      const listItems: string[] = [];
      const rawLines: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        rawLines.push(lines[i]);
        listItems.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }

      // Check if it's a data collection form (field labels)
      const formFields = onOptionClick ? parseFieldList(listItems) : null;
      if (formFields && onOptionClick) {
        // Render as editable form
        elements.push(
          <DataForm
            key={key++}
            fields={formFields}
            onSubmit={onOptionClick}
          />
        );
      } else if (looksLikeOptions(listItems) && onOptionClick) {
        // Render as clickable buttons
        elements.push(
          <div key={key++} className="flex flex-wrap gap-2 my-3">
            {listItems.map((item, li) => {
              const cleanLabel = item.replace(/\*\*/g, '');
              return (
                <button
                  key={li}
                  onClick={() => onOptionClick(cleanLabel)}
                  className="px-4 py-2.5 text-sm font-semibold text-left bg-surface-raised border border-border-subtle rounded-xl hover:border-csa-accent hover:bg-csa-accent/10 text-text-secondary hover:text-csa-accent transition-all duration-150 group"
                >
                  <span className="text-csa-accent mr-2 opacity-60 group-hover:opacity-100">
                    {li + 1}.
                  </span>
                  {renderInline(item)}
                </button>
              );
            })}
          </div>
        );
      } else {
        // Regular numbered list
        elements.push(
          <ol key={key++} className="space-y-1 my-2">
            {listItems.map((item, li) => (
              <li key={li} className="flex items-start gap-3 text-sm text-text-secondary">
                <span className="text-csa-accent font-bold text-xs mt-0.5 flex-shrink-0 w-5 text-right">
                  {li + 1}.
                </span>
                {renderInline(item)}
              </li>
            ))}
          </ol>
        );
      }
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="text-sm text-text-secondary leading-relaxed">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <>{elements}</>;
}

function renderInline(text: string): (string | React.ReactElement)[] {
  const parts: (string | React.ReactElement)[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\[(.+?)\]\((.+?)\))|(`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  let partKey = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      parts.push(
        <strong key={partKey++} className="font-bold text-text-primary">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      parts.push(
        <a
          key={partKey++}
          href={match[5]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-csa-accent hover:text-csa-highlight underline underline-offset-2 inline-flex items-center gap-1"
        >
          {match[4]}
          <ExternalLink size={11} className="inline" />
        </a>
      );
    } else if (match[6]) {
      parts.push(
        <code key={partKey++} className="px-1.5 py-0.5 bg-surface-raised text-csa-highlight text-xs font-mono rounded">
          {match[7]}
        </code>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function exportTableToExcel(headers: string[], rows: string[][]) {
  // Dynamic import to keep bundle size down
  import('xlsx').then((XLSX) => {
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');

    const now = new Date();
    const filename = `recivis-export-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}.xlsx`;
    XLSX.writeFile(wb, filename);
  });
}

function renderTable(lines: string[], key: number) {
  const headers = lines[0]
    .split('|')
    .map((h) => h.trim())
    .filter(Boolean);

  const rows = lines.slice(2).map((line) =>
    line
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean)
  );

  // Tables with 4+ rows get the export button (report-like tables)
  const showExport = rows.length >= 6;

  return (
    <div key={key} className="my-3 -mx-1 sm:-mx-4 md:-mx-8 lg:-mx-16">
      {showExport && (
        <div className="flex justify-end mb-2 px-1 sm:px-4 md:px-8 lg:px-16">
          <button
            onClick={() => exportTableToExcel(headers, rows)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-lg hover:bg-csa-accent/20 transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export to Excel
          </button>
        </div>
      )}
      <div className="overflow-x-auto border border-border-subtle rounded-xl">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-raised">
              {headers.map((h, hi) => (
                <th key={hi} className="whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="text-text-secondary">
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ChatMessageComponent({ message, index }: ChatMessageProps) {
  const { addMessage, isLoading } = useAppStore();
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming && !message.content;

  if (isStreaming) return null;

  const handleOptionClick = (text: string) => {
    if (isLoading) return;
    // Simulate clicking an option — send it as a user message
    const event = new CustomEvent('recivis-send-message', { detail: text });
    window.dispatchEvent(event);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.02, 0.1) }}
      className={`flex gap-3 py-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isUser ? 'bg-csa-purple' : 'bg-csa-accent'
        }`}
      >
        {isUser ? (
          <User size={16} className="text-white" />
        ) : (
          <Bot size={16} className="text-white" />
        )}
      </div>

      {/* Content */}
      <div
        className={`flex-1 max-w-[85%] ${
          isUser
            ? 'bg-csa-primary/30 border-r-4 border-csa-accent rounded-l-lg px-4 py-3'
            : 'px-1 py-1'
        }`}
      >
        {isUser ? (
          <p className="text-sm text-text-primary">{message.content}</p>
        ) : (
          <div className="space-y-1">
            {renderMarkdown(message.content, handleOptionClick)}
          </div>
        )}

        {/* Line item form — shown when Claude asks for quantity/dates/price */}
        {!isUser && !isLoading && (() => {
          const lineItemDefaults = detectLineItemPrompt(message.content);
          if (!lineItemDefaults) return null;
          return (
            <LineItemForm
              defaults={lineItemDefaults}
              onSubmit={handleOptionClick}
              disabled={isLoading}
            />
          );
        })()}

        {/* Action buttons — shown when Claude asks yes/no or confirmation questions */}
        {!isUser && !isLoading && (() => {
          const promptType = detectPromptType(message.content);
          const buttons = getPromptButtons(promptType);
          if (!buttons) return null;
          return (
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => handleOptionClick(buttons.primary.message)}
                className="flex items-center gap-2 px-5 py-2.5 bg-success/15 border-2 border-success/30 rounded-xl text-success text-sm font-semibold hover:bg-success/25 hover:border-success/50 transition-all cursor-pointer"
              >
                <CheckCircle size={16} />
                {buttons.primary.label}
              </button>
              <button
                onClick={() => handleOptionClick(buttons.secondary.message)}
                className="flex items-center gap-2 px-5 py-2.5 bg-surface-raised border-2 border-border-subtle rounded-xl text-text-secondary text-sm font-semibold hover:border-csa-accent hover:text-csa-accent transition-all cursor-pointer"
              >
                {buttons.secondary.icon === 'edit' ? <Pencil size={16} /> : <X size={16} />}
                {buttons.secondary.label}
              </button>
            </div>
          );
        })()}

        {/* Timestamp */}
        <p className={`text-[10px] text-text-muted mt-2 ${isUser ? 'text-right' : ''}`}>
          {new Date(message.timestamp).toLocaleTimeString('en-AU', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </motion.div>
  );
}
