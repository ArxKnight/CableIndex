import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Database } from 'lucide-react';
import StatCard from '../../../components/dashboard/StatCard';

describe('StatCard', () => {
  it('should render basic stat card with title and value', () => {
    render(
      <StatCard
        title="Total Labels"
        value={42}
        icon={Database}
      />
    );
    
    expect(screen.getByText('Total Labels')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('should render stat card with description', () => {
    render(
      <StatCard
        title="Total Labels"
        value="42"
        description="All time labels created"
        icon={Database}
      />
    );
    
    expect(screen.getByText('All time labels created')).toBeInTheDocument();
  });

  it('should render stat card with positive trend', () => {
    render(
      <StatCard
        title="Total Labels"
        value={42}
        icon={Database}
        trend={{ value: 15, isPositive: true }}
      />
    );
    
    expect(screen.getByText('+15%')).toBeInTheDocument();
    expect(screen.getByText('from last month')).toBeInTheDocument();
  });

  it('should render stat card with negative trend', () => {
    render(
      <StatCard
        title="Total Labels"
        value={42}
        icon={Database}
        trend={{ value: -5, isPositive: false }}
      />
    );
    
    expect(screen.getByText('-5%')).toBeInTheDocument();
    expect(screen.getByText('from last month')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <StatCard
        title="Total Labels"
        value={42}
        icon={Database}
        className="custom-class"
      />
    );
    
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('should render icon', () => {
    render(
      <StatCard
        title="Total Labels"
        value={42}
        icon={Database}
      />
    );
    
    // Check if the icon is rendered (Database icon should be present)
    const icon = document.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });
});