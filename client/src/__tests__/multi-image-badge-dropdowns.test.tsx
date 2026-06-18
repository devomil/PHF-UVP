// @vitest-environment jsdom
//
// Integration tests: verify the Multi-image badge is rendered for the right
// providers inside the actual QuickCreateForm and AssetCreatorDialog components.
//
// Both components use the same conditional pattern:
//   {providerSupportsMultiImage(p.id) && (
//     <span data-testid={`provider-multi-image-badge-${p.id}`}>…</span>
//   )}
//
// The Radix-UI Select is mocked so SelectContent always renders its children
// (no pointer interaction needed to open the dropdown), letting us directly
// query the rendered badge spans.
//
// The WITH_BADGE / WITHOUT_BADGE lists are derived from the shared catalog so
// they stay in sync automatically whenever a provider is added or removed.
// Mode-filtering assertions verify that providers restricted to a single
// generation mode don't bleed into incompatible dropdowns.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Shared mocks — applied before any component imports
// ---------------------------------------------------------------------------

// Select: always renders SelectContent children without a click.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  SelectContent: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-select-content': '' }, children),
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) =>
    React.createElement('div', { 'data-select-item': value }, children),
  SelectValue: () => null,
}));

// Tooltip: render content inline so badge tooltip wrappers don't interfere.
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  Tooltip: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  TooltipContent: () => null,
}));

// Slider: avoid Radix pointer events in jsdom.
vi.mock('@/components/ui/slider', () => ({
  Slider: () => null,
}));

// Dialog: render children directly.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  DialogContent: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/new-project', vi.fn()],
  Link: ({ children, ...props }: any) => React.createElement('a', props, children),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
    useQuery: () => ({ data: [], isLoading: false }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock('@/hooks/use-generation-error-handler', () => ({
  useGenerationErrorHandler: () => ({ handleGenerationError: vi.fn() }),
}));

vi.mock('@/components/credits/credit-cost', () => ({
  CreditCost: () => null,
}));

vi.mock('@/components/video/provider-catalog-selector', () => ({
  ProviderCatalogSelector: () => null,
}));

vi.mock('@/components/video/character-profiles-panel', () => ({
  CharacterProfilesPanel: () => null,
}));

vi.mock('@/components/video/AssetSuzzieChat', () => ({
  AssetSuzzieChat: () => null,
}));

vi.mock('@/assets/neuralcut-full-logo.png', () => ({ default: 'logo.png' }));

// ---------------------------------------------------------------------------
// Component imports (after vi.mock calls, which are hoisted)
// ---------------------------------------------------------------------------

import { QuickCreateForm } from '@/pages/new-project';
import { AssetCreatorDialog } from '@/components/video/AssetCreatorDialog';
import { getDropdownVideoProviders, providerSupportsMultiImage } from '@shared/provider-catalog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQC() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(QuickCreateForm, {
        onBack: vi.fn(),
        onSubmit: vi.fn(),
        isLoading: false,
      }),
    ),
  );
}

function makeAC() {
  return render(
    React.createElement(AssetCreatorDialog, {
      open: true,
      onOpenChange: vi.fn(),
    }),
  );
}

// Default (t2v) dropdown — derived at runtime so badge tests stay in sync.
const allDropdown = getDropdownVideoProviders('t2v');
const WITH_BADGE = allDropdown.filter(p => providerSupportsMultiImage(p.id)).map(p => p.id);
const WITHOUT_BADGE = allDropdown.filter(p => !providerSupportsMultiImage(p.id)).map(p => p.id);

// ---------------------------------------------------------------------------
// Catalog mode-filtering unit tests
// ---------------------------------------------------------------------------

describe('getDropdownVideoProviders — mode filtering', () => {
  it('includes omni-human-1.5 in i2v mode', () => {
    const ids = getDropdownVideoProviders('i2v').map(p => p.id);
    expect(ids).toContain('omni-human-1.5');
  });

  it('excludes omni-human-1.5 from t2v mode', () => {
    const ids = getDropdownVideoProviders('t2v').map(p => p.id);
    expect(ids).not.toContain('omni-human-1.5');
  });

  it('always includes auto regardless of mode', () => {
    expect(getDropdownVideoProviders('t2v')[0].id).toBe('auto');
    expect(getDropdownVideoProviders('i2v')[0].id).toBe('auto');
    expect(getDropdownVideoProviders()[0].id).toBe('auto');
  });

  it('includes standard t2v+i2v providers in both modes', () => {
    const t2vIds = getDropdownVideoProviders('t2v').map(p => p.id);
    const i2vIds = getDropdownVideoProviders('i2v').map(p => p.id);
    for (const id of ['kling-2.6', 'seedance-2.0', 'runway', 'veo-3.1']) {
      expect(t2vIds).toContain(id);
      expect(i2vIds).toContain(id);
    }
  });
});

// ---------------------------------------------------------------------------
// Quick Create provider Select
// ---------------------------------------------------------------------------

describe('QuickCreateForm provider Select — Multi-image badge', () => {
  it('shows the Multi-image badge for multi-image-capable providers', () => {
    makeQC();
    for (const id of WITH_BADGE) {
      expect(
        screen.getByTestId(`provider-multi-image-badge-${id}`),
        `expected Multi-image badge for ${id}`,
      ).toBeTruthy();
    }
  });

  it('does not show the Multi-image badge for non-capable providers', () => {
    makeQC();
    for (const id of WITHOUT_BADGE) {
      expect(
        screen.queryByTestId(`provider-multi-image-badge-${id}`),
        `expected NO badge for ${id}`,
      ).toBeNull();
    }
  });

  it('badge text reads "Multi-image" for every badged provider', () => {
    makeQC();
    for (const id of WITH_BADGE) {
      const badge = screen.getByTestId(`provider-multi-image-badge-${id}`);
      expect(badge.textContent).toMatch(/Multi-image/i);
    }
  });
});

// ---------------------------------------------------------------------------
// AssetCreatorDialog provider Select (default mode: t2v → VIDEO_PROVIDERS)
// ---------------------------------------------------------------------------

describe('AssetCreatorDialog provider Select — Multi-image badge', () => {
  it('shows the Multi-image badge for multi-image-capable providers', () => {
    makeAC();
    for (const id of WITH_BADGE) {
      expect(
        screen.getByTestId(`provider-multi-image-badge-${id}`),
        `expected Multi-image badge for ${id}`,
      ).toBeTruthy();
    }
  });

  it('does not show the Multi-image badge for non-capable providers', () => {
    makeAC();
    for (const id of WITHOUT_BADGE) {
      expect(
        screen.queryByTestId(`provider-multi-image-badge-${id}`),
        `expected NO badge for ${id}`,
      ).toBeNull();
    }
  });

  it('badge text reads "Multi-image" for every badged provider', () => {
    makeAC();
    for (const id of WITH_BADGE) {
      const badge = screen.getByTestId(`provider-multi-image-badge-${id}`);
      expect(badge.textContent).toMatch(/Multi-image/i);
    }
  });
});
