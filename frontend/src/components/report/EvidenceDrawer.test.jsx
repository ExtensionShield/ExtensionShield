import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import EvidenceDrawer from './EvidenceDrawer';

describe('EvidenceDrawer — only counts/opens resolvable evidence', () => {
  it('drops IDs that are not in the evidence index (count reflects only openable items)', () => {
    const { container } = render(
      <EvidenceDrawer
        open
        evidenceIds={['ev_a', 'ev_missing', 'ev_b']}
        evidenceIndex={{
          ev_a: { file_path: 'content.js', snippet: 'a()' },
          ev_b: { file_path: 'background.js', snippet: 'b()' },
        }}
        onClose={() => {}}
      />
    );
    // 2 of 3 IDs resolve -> count badge shows 2, not 3, and no empty state.
    expect(container.querySelector('.evidence-count').textContent).toBe('2');
    expect(container.querySelector('.no-evidence')).toBeNull();
  });

  it('shows the empty state when no IDs resolve', () => {
    const { container } = render(
      <EvidenceDrawer
        open
        evidenceIds={['missing_1', 'missing_2']}
        evidenceIndex={{}}
        onClose={() => {}}
      />
    );
    expect(container.querySelector('.evidence-count').textContent).toBe('0');
    expect(container.querySelector('.no-evidence')).not.toBeNull();
  });
});
