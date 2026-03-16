'use client';

import { motion } from 'framer-motion';
import { Bot, User, ExternalLink } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';
import { useAppStore } from '@/lib/store';

interface ChatMessageProps {
  message: ChatMessage;
  index: number;
}

/**
 * Detect if a block of numbered lines looks like selectable options
 * (short lines, typically choices like "1. Civil Site Design (CSD)")
 */
function looksLikeOptions(items: string[]): boolean {
  if (items.length < 2 || items.length > 8) return false;
  // Average line length < 80 chars = likely options, not prose
  const avgLen = items.reduce((s, l) => s + l.length, 0) / items.length;
  return avgLen < 80;
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

      if (looksLikeOptions(listItems) && onOptionClick) {
        // Render as clickable buttons
        elements.push(
          <div key={key++} className="flex flex-wrap gap-2 my-3">
            {listItems.map((item, li) => {
              // Strip markdown bold markers for the button label
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
    <div key={key} className="my-3 overflow-x-auto border border-border-subtle rounded-xl">
      <table>
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
