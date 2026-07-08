import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SimilarExtensions from './SimilarExtensions';

describe('SimilarExtensions', () => {
  it('is labeled Informational and states it is not used in the verdict', () => {
    render(
      <SimilarExtensions
        items={[
          { extensionId: 'a', name: 'DeepL Translator', users: 10_000_000, rating: 4.7 },
          { extensionId: 'b', name: 'Mate Translate', users: 5_000_000, rating: 4.5 },
        ]}
      />
    );
    expect(screen.getByText('Informational')).toBeInTheDocument();
    expect(screen.getByText(/not used in this verdict/i)).toBeInTheDocument();
    expect(screen.getByText('DeepL Translator')).toBeInTheDocument();
    expect(screen.getByText('Mate Translate')).toBeInTheDocument();
  });

  it('is omitted entirely when no similar-extension data is available', () => {
    const empty = render(<SimilarExtensions items={[]} />);
    expect(empty.container.firstChild).toBeNull();

    const missing = render(<SimilarExtensions items={undefined} />);
    expect(missing.container.firstChild).toBeNull();
  });
});
