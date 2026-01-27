import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import QuickActions from '../../../components/dashboard/QuickActions';

// Mock the permissions hook
const mockUsePermissions = vi.fn();

vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => mockUsePermissions(),
}));

const renderQuickActions = () => {
  return render(
    <BrowserRouter>
      <QuickActions />
    </BrowserRouter>
  );
};

describe('QuickActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockUsePermissions.mockReturnValue({
      canAccess: vi.fn().mockReturnValue(true),
    });
  });

  it('should render quick actions title', () => {
    renderQuickActions();
    
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
  });

  it('should render all action buttons when user has permissions', () => {
    renderQuickActions();
    
    expect(screen.getByText('Create Label')).toBeInTheDocument();
    expect(screen.getByText('Manage Sites')).toBeInTheDocument();
    expect(screen.getByText('View Database')).toBeInTheDocument();
    expect(screen.getByText('Port Labels')).toBeInTheDocument();
    expect(screen.getByText('PDU Labels')).toBeInTheDocument();
  });

  it('should render action descriptions', () => {
    renderQuickActions();
    
    expect(screen.getByText('Generate a new cable label')).toBeInTheDocument();
    expect(screen.getByText('Add or edit site locations')).toBeInTheDocument();
    expect(screen.getByText('Browse all your labels')).toBeInTheDocument();
    expect(screen.getByText('Generate switch port labels')).toBeInTheDocument();
    expect(screen.getByText('Generate PDU port labels')).toBeInTheDocument();
  });

  it('should hide actions when user lacks permissions', () => {
    mockUsePermissions.mockReturnValue({
      canAccess: vi.fn((permission) => permission !== 'sites'),
    });

    renderQuickActions();
    
    expect(screen.getByText('Create Label')).toBeInTheDocument();
    expect(screen.queryByText('Manage Sites')).not.toBeInTheDocument();
    expect(screen.getByText('View Database')).toBeInTheDocument();
  });

  it('should render correct links for actions', () => {
    renderQuickActions();
    
    const createLabelLink = screen.getByText('Create Label').closest('a');
    expect(createLabelLink).toHaveAttribute('href', '/labels/create');
    
    const sitesLink = screen.getByText('Manage Sites').closest('a');
    expect(sitesLink).toHaveAttribute('href', '/sites');
    
    const labelsLink = screen.getByText('View Database').closest('a');
    expect(labelsLink).toHaveAttribute('href', '/labels');
    
    const portLabelsLink = screen.getByText('Port Labels').closest('a');
    expect(portLabelsLink).toHaveAttribute('href', '/port-labels');
    
    const pduLabelsLink = screen.getByText('PDU Labels').closest('a');
    expect(pduLabelsLink).toHaveAttribute('href', '/pdu-labels');
  });

  it('should render icons for each action', () => {
    renderQuickActions();
    
    // Check if icons are rendered (should have multiple SVG elements)
    const icons = document.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThan(5); // At least one icon per action plus the title icon
  });

  it('should apply correct button variants', () => {
    renderQuickActions();
    
    // Create Label should have default variant (primary styling)
    const createLabelButton = screen.getByText('Create Label').closest('a');
    expect(createLabelButton).toHaveClass('bg-blue-600');
    
    // Other buttons should have outline variant
    const sitesButton = screen.getByText('Manage Sites').closest('a');
    expect(sitesButton).not.toHaveClass('bg-blue-600');
  });
});