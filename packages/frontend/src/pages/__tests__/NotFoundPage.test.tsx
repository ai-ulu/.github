import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/utils';
import { NotFoundPage } from '../NotFoundPage';

describe('NotFoundPage', () => {
  it('renders 404 error message', () => {
    render(<NotFoundPage />);
    
    const errorCode = screen.getByText('404');
    const errorTitle = screen.getByText('Page not found');
    const errorDescription = screen.getByText(/Sorry, we couldn't find the page you're looking for/i);
    
    expect(errorCode).toBeInTheDocument();
    expect(errorCode).toHaveClass('text-9xl', 'font-bold', 'text-gray-300');
    expect(errorTitle).toBeInTheDocument();
    expect(errorDescription).toBeInTheDocument();
  });

  it('renders navigation buttons', () => {
    render(<NotFoundPage />);
    
    const homeLink = screen.getByRole('link', { name: /go home/i });
    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');
    
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
  });

  it('has proper layout and styling', () => {
    render(<NotFoundPage />);
    
    const container = screen.getByText('404').closest('div');
    expect(container).toHaveClass('min-h-screen', 'bg-gray-50');
    
    const content = screen.getByText('Page not found').closest('div');
    expect(content).toHaveClass('text-center');
  });
});