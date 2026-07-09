import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Landmark, Lock, Shield } from 'lucide-react';
import { LayerCards } from './ScanResultsPageV2';
import { REPORT_QUICK_NAV_ITEMS } from './ScanResultsPageV2.constants';

describe('LayerCards', () => {
  it('renders real score, status count, summary, progress affordance, and CTA', () => {
    const onOpenLayer = vi.fn();
    render(
      <LayerCards
        onOpenLayer={onOpenLayer}
        layerCards={[
          {
            key: 'security',
            label: 'Security',
            Icon: Shield,
            score: 90,
            band: 'WARN',
            count: 2,
            explain: 'Low security risk with minimal concerns.',
          },
          {
            key: 'privacy',
            label: 'Privacy',
            Icon: Lock,
            score: 58,
            band: 'WARN',
            count: 2,
            explain: 'Moderate privacy risk: signals that sensitive data could be sent out.',
          },
          {
            key: 'governance',
            label: 'Governance',
            Icon: Landmark,
            score: 100,
            band: 'GOOD',
            count: 0,
            explain: 'Low governance risk with good policy compliance.',
          },
        ]}
      />
    );

    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getByText('58')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getAllByText('2 issues')).toHaveLength(2);
    expect(screen.getByText('No issues')).toBeInTheDocument();
    expect(screen.getByText('Low security risk with minimal concerns.')).toBeInTheDocument();
    expect(screen.getAllByText(/View details/i)).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: /Security details: 2 issues/i }));
    expect(onOpenLayer).toHaveBeenCalledWith('security');
  });
});

describe('ScanResultsPageV2 report flow', () => {
  it('links quick navigation to Evidence & Technical Details instead of the removed Analyzer Coverage section', () => {
    expect(REPORT_QUICK_NAV_ITEMS).not.toContainEqual(expect.objectContaining({ id: 'analyzer-coverage' }));
    expect(REPORT_QUICK_NAV_ITEMS).toContainEqual({
      id: 'evidence-technical-details',
      label: 'Evidence & Technical Details / Coverage',
    });
  });
});
