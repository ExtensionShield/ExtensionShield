import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RiskVerdictBadge from './RiskVerdictBadge';

describe('RiskVerdictBadge — verdict badge and provenance chip are separate', () => {
  it('ALLOW with an unverified listing keeps the visible "Safe" badge AND shows a separate chip', () => {
    render(<RiskVerdictBadge decision="ALLOW" level="low" score={90} unverified />);

    const badgeLabel = screen.getByText('Safe');
    const chip = screen.getByText('Unverified listing');
    expect(badgeLabel).toBeInTheDocument();
    expect(chip).toBeInTheDocument();
    // Separate elements: the chip is not inside the verdict badge.
    expect(badgeLabel.closest('.risk-badge')).not.toBeNull();
    expect(chip.closest('.risk-badge')).toBeNull();
    expect(chip.classList.contains('provenance-chip')).toBe(true);
  });

  it('NEEDS_REVIEW renders "Review" and the chip stays independent', () => {
    render(<RiskVerdictBadge decision="NEEDS_REVIEW" level="low" score={80} unverified />);
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Unverified listing')).toBeInTheDocument();
  });

  it('BLOCK renders "Blocked"', () => {
    render(<RiskVerdictBadge decision="BLOCK" level="high" score={40} />);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('verified listing renders no provenance chip', () => {
    render(<RiskVerdictBadge decision="ALLOW" level="low" score={90} unverified={false} />);
    expect(screen.getByText('Safe')).toBeInTheDocument();
    expect(screen.queryByText('Unverified listing')).toBeNull();
  });

  it('specific provenance warnings render as one compact chip with the rest in the tooltip', () => {
    render(
      <RiskVerdictBadge
        decision="ALLOW"
        level="low"
        score={90}
        warnings={['Edge listing', 'Version mismatch']}
      />
    );
    // Verdict badge stays authoritative and separate.
    expect(screen.getByText('Safe')).toBeInTheDocument();
    // One chip only: first warning + overflow count, full list in the tooltip.
    const chip = screen.getByText(/Edge listing/);
    expect(chip.textContent).toBe('Edge listing +1');
    expect(chip.getAttribute('title')).toBe('Edge listing · Version mismatch');
    expect(chip.closest('.risk-badge')).toBeNull();
  });

  it('empty warnings array with unverified=false renders no chip', () => {
    render(<RiskVerdictBadge decision="NEEDS_REVIEW" level="low" score={80} warnings={[]} />);
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(document.querySelector('.provenance-chip')).toBeNull();
  });
});
