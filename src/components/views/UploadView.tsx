'use client';

import { useState, useRef } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import ChatInterface from '../chat/ChatInterface';

export default function UploadView() {
  return (
    <ChatInterface
      initialMessage={`**Purchase Order Upload**\n\nUpload a PDF or image of a purchase order and I'll extract the details and create the invoice automatically.\n\nYou can:\n- Drag and drop a file into the chat\n- Or just describe the order details manually\n\nWhat would you like to do?`}
      placeholder="Describe the PO details or paste order information..."
    />
  );
}
