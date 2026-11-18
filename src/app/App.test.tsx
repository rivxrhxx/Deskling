import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App (smoke)', () => {
  it('renders the Deskling root region', () => {
    render(<App />);
    expect(screen.getByRole('region', { name: 'Deskling' })).toBeInTheDocument();
  });
});
