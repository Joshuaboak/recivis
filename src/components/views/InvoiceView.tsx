'use client';

import ChatInterface from '../chat/ChatInterface';

export default function InvoiceView() {
  return (
    <ChatInterface
      initialMessage="New product or renewal? Give me an email address, contact name or account name and I'll get started."
      placeholder="Enter an email, contact name, or account name..."
    />
  );
}
