import { describe, it, expect } from 'vitest';
import { render, screen } from '../../../test/utils';
import { PublicLayout } from '../PublicLayout';

describe('PublicLayout', () => {
  it('renders header with app name', () => {
    render(<PublicLayout />);
    
    const header = screen.getByRole('banner');
    const appName = screen.getByText('AutoQA Pilot');
    
    expect(header).toBeInTheDocument();
    expect(appName).toBeInTheDocument();
    expect(appName).toHaveClass('text-xl', 'font-bold', 'text-gray-900');
  });

  it('renders main content area', () => {
    render(<PublicLayout />);
    
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
  });

  it('has proper layout structure', () => {
    render(<PublicLayout />);
    
    const container = screen.getByRole('banner').closest('div');
    expect(container).toHaveClass('min-h-screen', 'bg-gray-50');
    
    const header = screen.getByRole('banner');
    expect(header).toHaveClass('bg-white', 'shadow-sm');
  });
});