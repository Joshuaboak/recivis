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
import { ALL_SECTIONS } from '@/lib/tour/sections';

const SRC = join(process.cwd(), 'src');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

/**
 * Every data-tour value present in the app's markup.
 *
 * Two forms count. The plain attribute, and the conditional one — an anchor
 * that is only attached when it has something under it, which is how a button
 * rendered in a loop names one instance, and how a panel that can be empty
 * avoids offering the tour a target with no height.
 */
function definedAnchors(): Set<string> {
  const found = new Set<string>();
  for (const file of tsxFiles(SRC)) {
    const source = readFileSync(file, 'utf-8');
    for (const match of source.matchAll(/data-tour="([a-z0-9-]+)"/g)) {
      found.add(match[1]);
    }
    for (const expression of source.matchAll(/data-tour=\{([^}]*)\}/g)) {
      for (const literal of expression[1].matchAll(/'([a-z0-9-]+)'/g)) {
        found.add(literal[1]);
      }
    }
  }
  return found;
}

describe('tour anchors', () => {
  const defined = definedAnchors();

  const steps = ALL_SECTIONS.flatMap(section =>
    section.steps.map(step => ({ ...step, section: section.id }))
  );

  it('finds an element for every anchor the tutorial names', () => {
    for (const step of steps) {
      if (!step.anchor) continue;
      expect(
        defined.has(step.anchor),
        `${step.section}/${step.id} wants [data-tour="${step.anchor}"]`
      ).toBe(true);
    }
  });

  it('does not leave anchors in the markup that nothing points at', () => {
    const used = new Set(steps.map(s => s.anchor).filter(Boolean));
    for (const anchor of defined) {
      expect(used.has(anchor), `[data-tour="${anchor}"] is never used`).toBe(true);
    }
  });

  /**
   * A section explains one page, so its anchors come from one page's markup.
   *
   * The shell is the exception — the sidebar, header and user menu are on
   * every route, and a section is entitled to point at them. Everything else
   * belongs to exactly one view, and a section naming anchors from two of them
   * is pointing at something the reader cannot see. That failure is invisible
   * at runtime, because a missing anchor skips.
   */
  it('takes its page anchors from a single view', () => {
    const owner = anchorOwners();
    for (const section of ALL_SECTIONS) {
      const views = new Set(
        section.steps
          .map(step => step.anchor && owner.get(step.anchor))
          .filter((file): file is string => !!file && !isShell(file))
      );
      expect(
        views.size <= 1,
        `section "${section.id}" mixes anchors from ${[...views].join(' and ')}`
      ).toBe(true);
    }
  });
});

/** The file each anchor is defined in. */
function anchorOwners(): Map<string, string> {
  const owner = new Map<string, string>();
  for (const file of tsxFiles(SRC)) {
    const source = readFileSync(file, 'utf-8');
    const names = [
      ...[...source.matchAll(/data-tour="([a-z0-9-]+)"/g)].map(m => m[1]),
      ...[...source.matchAll(/data-tour=\{([^}]*)\}/g)].flatMap(m =>
        [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map(l => l[1])
      ),
    ];
    for (const name of names) {
      if (!owner.has(name)) owner.set(name, file.split(/[\\/]/).pop()!);
    }
  }
  return owner;
}

/** Files whose markup is on every route. */
function isShell(file: string): boolean {
  return ['layout.tsx', 'Sidebar.tsx', 'UserMenu.tsx', 'SupportWidget.tsx', 'SectionHelpButton.tsx']
    .includes(file);
}
