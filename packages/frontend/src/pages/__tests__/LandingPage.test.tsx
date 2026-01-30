import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/utils';
import { LandingPage } from '../LandingPage';

describe('LandingPage', () => {
  it('renders main heading and description', () => {
    render(<LandingPage />);
    
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('AutoQA Pilot');
    
    const description = screen.getByText(/AI-powered autonomous testing platform/i);
    expect(description).toBeInTheDocument();
  });

  it('renders get started button with correct link', () => {
    render(<LandingPage />);
    
    const getStartedLink = screen.getByRole('link', { name: /get started with github/i });
    expect(getStartedLink).toBeInTheDocument();
    expect(getStartedLink).toHaveAttribute('href', '/login');
  });

  it('renders feature cards', () => {
    render(<LandingPage />);
    
    expect(screen.getByText('AI-Powered Generation')).toBeInTheDocument();
    expect(screen.getByText('Autonomous Execution')).toBeInTheDocument();
    expect(screen.getByText('Visual Regression')).toBeInTheDocument();
    
    // Check feature descriptions
    expect(screen.getByText(/Generate comprehensive test scenarios/i)).toBeInTheDocument();
    expect(screen.getByText(/Run tests automatically with self-healing/i)).toBeInTheDocument();
    expect(screen.getByText(/Detect visual changes and maintain UI consistency/i)).toBeInTheDocument();
  });

  it('has proper responsive layout classes', () => {
    render(<LandingPage />);
    
    const container = screen.getByText('AutoQA Pilot').closest('div');
    expect(container).toHaveClass('py-20', 'text-center');
    
    const featuresGrid = screen.getByText('AI-Powered Generation').closest('.grid');
    expect(featuresGrid).toHaveClass('grid-cols-1', 'sm:grid-cols-3');
  });
});