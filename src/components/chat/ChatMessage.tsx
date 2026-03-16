'use client';

import { motion } from 'framer-motion';
import { Bot, User, ExternalLink } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';

interface ChatMessageProps {
  message: ChatMessage;
  index: number;
}

// Simple markdown-to-JSX renderer for tables, bold, links, lists, and code
function renderMarkdown(content: string) {
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
        <div key={key++} className="border-l-4 border-csa-accent pl-4 py-2 my-2 bg-csa-accent/5">
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
              <span className="text-csa-accent mt-1.5 w-1.5 h-1.5 bg-csa-accent flex-shrink-0" />
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\.\s/)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        listItems.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
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
  // Process bold, links, code, and inline formatting
  const regex = /(\*\*(.+?)\*\*)|(\[(.+?)\]\((.+?)\))|(`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  let partKey = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Bold
      parts.push(
        <strong key={partKey++} className="font-bold text-text-primary">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // Link
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
      // Code
      parts.push(
        <code key={partKey++} className="px-1.5 py-0.5 bg-surface-raised text-csa-highlight text-xs font-mono">
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

  return (
    <div key={key} className="my-3 overflow-x-auto border-2 border-border-subtle">
      <table>
        <thead>
          <tr className="bg-surface-raised">
            {headers.map((h, hi) => (
              <th key={hi}>{h}</th>
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
  );
}

export default function ChatMessageComponent({ message, index }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming && !message.content;

  if (isStreaming) return null; // Handled by typing indicator

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.02, 0.1) }}
      className={`flex gap-3 py-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 flex items-center justify-center flex-shrink-0 ${
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
            ? 'bg-csa-primary/30 border-r-4 border-csa-accent px-4 py-3'
            : 'px-1 py-1'
        }`}
      >
        {isUser ? (
          <p className="text-sm text-text-primary">{message.content}</p>
        ) : (
          <div className="space-y-1">{renderMarkdown(message.content)}</div>
        )}

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
