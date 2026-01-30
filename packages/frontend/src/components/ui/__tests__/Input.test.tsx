import { describe, it, expect } from 'vitest';
import { render, screen } from '../../../test/utils';
import { Input } from '../Input';

describe('Input', () => {
  it('renders with default props', () => {
    render(<Input />);
    
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveClass('flex', 'h-10', 'w-full', 'rounded-md', 'border');
  });

  it('renders with label', () => {
    render(<Input label="Email Address" />);
    
    const label = screen.getByText('Email Address');
    const input = screen.getByRole('textbox');
    
    expect(label).toBeInTheDocument();
    expect(label).toHaveAttribute('for', 'email-address');
    expect(input).toHaveAttribute('id', 'email-address');
  });

  it('shows error state correctly', () => {
    render(<Input label="Email" error="Email is required" />);
    
    const input = screen.getByRole('textbox');
    const errorMessage = screen.getByRole('alert');
    
    expect(input).toHaveClass('border-red-500', 'focus:ring-red-500');
    expect(errorMessage).toHaveTextContent('Email is required');
    expect(errorMessage).toHaveClass('text-red-600');
  });

  it('applies custom className', () => {
    render(<Input className="custom-input" />);
    
    expect(screen.getByRole('textbox')).toHaveClass('custom-input');
  });

  it('forwards props correctly', () => {
    render(<Input placeholder="Enter text" type="email" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Enter text');
    expect(input).toHaveAttribute('type', 'email');
  });

  it('handles disabled state', () => {
    render(<Input disabled />);
    
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    expect(input).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-50');
  });
});