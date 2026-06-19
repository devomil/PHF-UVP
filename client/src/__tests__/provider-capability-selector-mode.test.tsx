// @vitest-environment jsdom
//
// Tests verifying that ProviderCapabilitySelector correctly filters providers
// based on the `mode` prop. When mode changes, the dropdown should only show
// providers compatible with that mode. A regression could silently re-expose
// incompatible providers (e.g. showing an i2v-only model in a t2v dropdown).
//
// Strategy:
//   - Render the component, click the trigger button to expand the dropdown,
//     then assert presence/absence of provider display names.
//   - Provider IDs and display names are derived at test-time from the shared
//     catalog so the tests stay in sync as providers are added or removed.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { getDropdownVideoProviders } from '@shared/provider-catalog';
import { VIDEO_PROVIDERS } from '@shared/provider-config';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Mocks — applied before any component import (vi.mock calls are hoisted)
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  Tooltip: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  TooltipContent: () => null,
}));

// ---------------------------------------------------------------------------
// Component under test — imported after vi.mock so mocks are applied
// ---------------------------------------------------------------------------

import { ProviderCapabilitySelector } from '@/components/video/ProviderCapabilityCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the display text the component actually renders for a given provider id.
 * ProviderCapabilityCard prefers VIDEO_PROVIDERS[id].displayName, then falls
 * back to the catalog entry name.
 */
function resolveDisplayName(id: string): string {
  const vp = VIDEO_PROVIDERS[id];
  if (vp?.displayName) return vp.displayName;
  const catalogEntry = getDropdownVideoProviders().find(e => e.id === id);
  return catalogEntry?.name ?? id;
}

/**
 * Escape special regex characters so a display name can be used in RegExp().
 */
function escapeForRegex(str: string): string {
  return str.replace(/[()[\].+*?^${}|\\]/g, '\\$&');
}

/**
 * Render ProviderCapabilitySelector with the given mode and click the trigger
 * button to expand the provider dropdown.
 */
function renderAndExpand(mode?: 't2v' | 'i2v' | 'v2v') {
  render(
    React.createElement(ProviderCapabilitySelector, {
      selectedProvider: 'auto',
      onSelectProvider: vi.fn(),
      mode,
    }),
  );
  fireEvent.click(screen.getByRole('button'));
}

// ---------------------------------------------------------------------------
// Catalog-derived provider sets (computed once, before all tests)
// ---------------------------------------------------------------------------

const t2vDropdown = getDropdownVideoProviders('t2v').filter(p => p.id !== 'auto');
const i2vDropdown = getDropdownVideoProviders('i2v').filter(p => p.id !== 'auto');

const t2vIdSet = new Set(t2vDropdown.map(p => p.id));
const i2vIdSet = new Set(i2vDropdown.map(p => p.id));

// Providers that appear in i2v mode but NOT t2v mode.
const i2vOnlyEntries = i2vDropdown.filter(p => !t2vIdSet.has(p.id));

// Providers that appear in t2v mode but NOT i2v mode (expected to be empty).
const t2vOnlyEntries = t2vDropdown.filter(p => !i2vIdSet.has(p.id));

// The well-known i2v-only provider used for concrete assertions.
const I2V_ONLY_ID = 'omni-human-1.5';
const I2V_ONLY_DISPLAY = resolveDisplayName(I2V_ONLY_ID);

// ---------------------------------------------------------------------------
// Catalog-layer unit tests (pure data — no DOM rendering needed)
// ---------------------------------------------------------------------------

describe('getDropdownVideoProviders — i2v vs t2v provider sets', () => {
  it('i2v mode contains more providers than t2v mode', () => {
    expect(i2vDropdown.length).toBeGreaterThan(t2vDropdown.length);
  });

  it('omni-human-1.5 is in the i2v provider list', () => {
    expect(i2vIdSet.has(I2V_ONLY_ID)).toBe(true);
  });

  it('omni-human-1.5 is NOT in the t2v provider list', () => {
    expect(t2vIdSet.has(I2V_ONLY_ID)).toBe(false);
  });

  it('no t2v-only providers exist (t2v is a strict subset of i2v)', () => {
    expect(t2vOnlyEntries).toHaveLength(0);
  });

  it('omni-human-1.5 is the only i2v-only dropdown provider', () => {
    expect(i2vOnlyEntries.map(p => p.id)).toContain(I2V_ONLY_ID);
    expect(i2vOnlyEntries.every(p => p.id === I2V_ONLY_ID)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ProviderCapabilitySelector — mode="i2v" renders i2v-only providers
// ---------------------------------------------------------------------------

describe('ProviderCapabilitySelector — mode="i2v" shows i2v-only providers', () => {
  it('renders OmniHuman 1.5 (i2v-only) in the expanded dropdown', () => {
    renderAndExpand('i2v');
    expect(
      screen.queryByText(new RegExp(escapeForRegex(I2V_ONLY_DISPLAY), 'i')),
    ).not.toBeNull();
  });

  it('renders all i2v-only providers when mode is i2v', () => {
    renderAndExpand('i2v');
    for (const entry of i2vOnlyEntries) {
      const display = resolveDisplayName(entry.id);
      expect(
        screen.queryByText(new RegExp(escapeForRegex(display), 'i')),
        `expected "${display}" to be visible with mode="i2v"`,
      ).not.toBeNull();
    }
  });

  it('renders all t2v-compatible providers too (i2v is a superset)', () => {
    renderAndExpand('i2v');
    for (const entry of t2vDropdown) {
      const display = resolveDisplayName(entry.id);
      // Use queryAllByText to handle names that are substrings of other names
      // (e.g. "Kling 2.6" is a substring of "Kling 2.6 Pro").
      const matches = screen.queryAllByText(new RegExp(`^${escapeForRegex(display)}$`, 'i'));
      expect(
        matches.length,
        `expected "${display}" to also be visible with mode="i2v"`,
      ).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// ProviderCapabilitySelector — mode="t2v" hides i2v-only providers
// ---------------------------------------------------------------------------

describe('ProviderCapabilitySelector — mode="t2v" hides i2v-only providers', () => {
  it('does NOT render OmniHuman 1.5 (i2v-only) in the expanded dropdown', () => {
    renderAndExpand('t2v');
    expect(
      screen.queryByText(new RegExp(escapeForRegex(I2V_ONLY_DISPLAY), 'i')),
    ).toBeNull();
  });

  it('hides every i2v-only provider when mode is t2v', () => {
    renderAndExpand('t2v');
    for (const entry of i2vOnlyEntries) {
      const display = resolveDisplayName(entry.id);
      expect(
        screen.queryByText(new RegExp(escapeForRegex(display), 'i')),
        `expected "${display}" to be hidden with mode="t2v"`,
      ).toBeNull();
    }
  });

  it('still renders all t2v-compatible providers when mode is t2v', () => {
    renderAndExpand('t2v');
    for (const entry of t2vDropdown) {
      const display = resolveDisplayName(entry.id);
      // Anchor to exact name to avoid false-positive substring matches.
      const matches = screen.queryAllByText(new RegExp(`^${escapeForRegex(display)}$`, 'i'));
      expect(
        matches.length,
        `expected "${display}" to be visible with mode="t2v"`,
      ).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// ProviderCapabilitySelector — provider list changes when mode changes
// ---------------------------------------------------------------------------

describe('ProviderCapabilitySelector — provider list changes between modes', () => {
  it('re-mounting with mode="i2v" shows providers that mode="t2v" hides', () => {
    // t2v: omni-human-1.5 absent
    renderAndExpand('t2v');
    expect(
      screen.queryByText(new RegExp(escapeForRegex(I2V_ONLY_DISPLAY), 'i')),
    ).toBeNull();
    cleanup();

    // i2v: omni-human-1.5 present
    renderAndExpand('i2v');
    expect(
      screen.queryByText(new RegExp(escapeForRegex(I2V_ONLY_DISPLAY), 'i')),
    ).not.toBeNull();
  });

  it('a provider appearing in both modes renders in both t2v and i2v dropdowns', () => {
    // Pick the first shared provider (one that has both t2v and i2v support).
    const sharedEntry = t2vDropdown[0];
    const display = resolveDisplayName(sharedEntry.id);

    renderAndExpand('t2v');
    expect(
      screen.queryByText(new RegExp(escapeForRegex(display), 'i')),
      `expected "${display}" in t2v mode`,
    ).not.toBeNull();
    cleanup();

    renderAndExpand('i2v');
    expect(
      screen.queryByText(new RegExp(escapeForRegex(display), 'i')),
      `expected "${display}" in i2v mode`,
    ).not.toBeNull();
  });
});
