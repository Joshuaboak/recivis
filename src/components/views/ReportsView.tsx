'use client';

import ChatInterface from '../chat/ChatInterface';

export default function ReportsView() {
  return (
    <ChatInterface
      initialMessage={`**Reports**\n\nWhat would you like to see?\n\n**1.** Expiring assets — show assets due for renewal\n**2.** Recent invoices — view invoice history\n**3.** Account summary — overview of your customers\n\nPick a number or describe what you're looking for.`}
      placeholder="Ask about expiring assets, recent invoices, or account summaries..."
    />
  );
}
