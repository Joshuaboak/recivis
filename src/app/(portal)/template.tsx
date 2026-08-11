/**
 * Portal template — fades each route in as it mounts.
 *
 * A template remounts on every navigation, which is what makes the enter
 * animation replay. There is no exit animation: App Router never holds the
 * old and new trees in one render, so the previous `AnimatePresence
 * mode="popLayout"` could not survive the move to real routes.
 */

'use client';

import { motion } from 'framer-motion';

export default function PortalTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
