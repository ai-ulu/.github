import { describe, it, expect } from 'vitest';
import { render, screen } from '../../../test/utils';
import { LoadingSpinner } from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default props', () => {
    render(<LoadingSpinner />);
    
    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
    expect(spinner).toHaveClass('animate-spin', 'h-6', 'w-6');
  });

  it('renders different sizes correctly', () => {
    const { rerender } = render(<LoadingSpinner size="sm" />);
    expect(screen.getByRole('status')).toHaveClass('h-4', 'w-4');

    rerender(<LoadingSpinner size="lg" />);
    expect(screen.getByRole('status')).toHaveClass('h-8', 'w-8');
  });

  it('applies custom className', () => {
    render(<LoadingSpinner className="custom-spinner" />);
    
    expect(screen.getByRole('status')).toHaveClass('custom-spinner');
  });

  it('has proper accessibility attributes', () => {
    render(<LoadingSpinner />);
    
    const spinner = screen.getByRole('status');
    const srText = screen.getByText('Loading...');
    
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
    expect(srText).toHaveClass('sr-only');
  });
});