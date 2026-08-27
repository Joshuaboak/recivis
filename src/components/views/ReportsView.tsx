'use client';

import { Clock, FileText, FileClock } from 'lucide-react';
import ChatInterface from '../chat/ChatInterface';
import { useAppStore } from '@/lib/store';

const quickActions = [
  { label: 'Expiring Assets (30 days)', icon: Clock, message: 'Show assets expiring in the next 30 days' },
  { label: 'Approved Orders', icon: FileText, message: 'Show approved invoices from the last 30 days' },
  { label: 'Draft Orders', icon: FileClock, message: 'Show all draft invoices' },
];

export default function ReportsView() {
  const { user } = useAppStore();

  // Reachable by URL even with the nav entry hidden, so the page checks too.
  if (!user?.permissions?.canViewReports) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-muted">You do not have permission to view reports.</p>
      </div>
    );
  }

  return (
    <ChatInterface
      initialMessage="Select a report or describe what you're looking for."
      placeholder="Ask about expiring assets, orders, or accounts..."
      quickActions={quickActions}
    />
  );
}
