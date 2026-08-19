/**
 * Every anchor the tour asks for must exist in the markup.
 *
 * The tour matches elements by [data-tour="..."], and a missing target is
 * silent by design — the step skips rather than stalling, which is right for a
 * permission-gated button and wrong for a typo. This is what tells the two
 * apart: a step naming an anchor nothing carries fails here instead of quietly
 * disappearing from the tutorial.
 *
 * It reads the source rather than rendering, because rendering these views
 * means a browser environment and a CRM behind them; the attribute is a static
 * string and can be checked as one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_TOUR_STEPS } from '@/lib/tour/steps';

const SRC = join(process.cwd(), 'src');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

/** Every data-tour value present in the app's markup. */
function definedAnchors(): Set<string> {
  const found = new Set<string>();
  for (const file of tsxFiles(SRC)) {
    const source = readFileSync(file, 'utf-8');
    for (const match of source.matchAll(/data-tour="([a-z0-9-]+)"/g)) {
      found.add(match[1]);
    }
  }
  return found;
}

describe('tour anchors', () => {
  const defined = definedAnchors();

  it('finds an element for every anchor the tour names', () => {
    for (const step of ALL_TOUR_STEPS) {
      if (!step.anchor) continue;
      expect(defined.has(step.anchor), `step "${step.id}" wants [data-tour="${step.anchor}"]`).toBe(true);
    }
  });

  it('does not leave anchors in the markup that nothing points at', () => {
    const used = new Set(ALL_TOUR_STEPS.map(s => s.anchor).filter(Boolean));
    for (const anchor of defined) {
      expect(used.has(anchor), `[data-tour="${anchor}"] is never used by the tour`).toBe(true);
    }
  });
});
