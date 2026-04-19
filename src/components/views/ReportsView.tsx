'use client';

import { Clock, FileText, FileClock } from 'lucide-react';
import ChatInterface from '../chat/ChatInterface';

const quickActions = [
  { label: 'Expiring Assets (30 days)', icon: Clock, message: 'Show assets expiring in the next 30 days' },
  { label: 'Approved Orders', icon: FileText, message: 'Show approved invoices from the last 30 days' },
  { label: 'Draft Orders', icon: FileClock, message: 'Show all draft invoices' },
];

export default function ReportsView() {
  return (
    <ChatInterface
      initialMessage="Select a report or describe what you're looking for."
      placeholder="Ask about expiring assets, orders, or accounts..."
      quickActions={quickActions}
    />
  );
}
