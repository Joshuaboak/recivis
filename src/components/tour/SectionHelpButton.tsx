/**
 * SectionHelpButton — "explain this page", in the header.
 *
 * One button rather than one per page, because it is the same question
 * everywhere and the answer is decided by the route. It renders only when the
 * page it is on has something to say, so it is never a button that does
 * nothing — and it renders whether or not the tutorial has been seen, since
 * asking again is the whole point of it.
 *
 * Independent of the guided-tutorial toggle. That switch decides whether the
 * tutorial interrupts; this is the user choosing to be told.
 */

'use client';

import { usePathname } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { sectionForPath } from '@/lib/tour/sections';
import { openTour } from '@/lib/tour/progress';

export default function SectionHelpButton() {
  const { user } = useAppStore();
  const pathname = usePathname();

  const section = sectionForPath(pathname, user?.permissions);
  if (!section) return null;

  return (
    <button
      data-tour="header-help"
      onClick={() => openTour(section.id)}
      title={`Explain ${section.title}`}
      aria-label={`Explain ${section.title}`}
      className="w-9 h-9 flex items-center justify-center rounded-xl text-text-muted hover:text-csa-accent hover:bg-surface-raised transition-colors cursor-pointer"
    >
      <GraduationCap size={17} />
    </button>
  );
}
