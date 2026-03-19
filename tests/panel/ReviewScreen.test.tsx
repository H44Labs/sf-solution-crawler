import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReviewScreen } from '../../src/panel/screens/ReviewScreen';

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  storage: {
    local: { get: vi.fn(), set: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

const sampleFields = {
  'general.companyName': {
    value: 'Acme Corp',
    confidence: 'high',
    source: 'https://example.salesforce.com/opp/001',
    rawEvidence: 'Account Name: Acme Corp',
  },
  'general.industry': {
    value: 'Technology',
    confidence: 'medium',
    source: 'https://example.salesforce.com/opp/001',
    rawEvidence: 'Industry: Technology (inferred)',
  },
  'general.employees': {
    value: '',
    confidence: 'low',
    source: 'unknown',
    rawEvidence: 'No employee count found',
  },
};

const defaultProps = {
  fields: sampleFields,
  onApprove: vi.fn(),
  onRecrawlSection: vi.fn(),
  onCancel: vi.fn(),
  onEditField: vi.fn(),
};

describe('ReviewScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders fields with the correct confidence badges', () => {
    render(<ReviewScreen {...defaultProps} />);

    // high confidence field
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    const highBadge = screen.getByTestId('confidence-badge-high');
    expect(highBadge).toBeInTheDocument();

    // medium confidence field
    expect(screen.getByText('Technology')).toBeInTheDocument();
    const medBadge = screen.getByTestId('confidence-badge-medium');
    expect(medBadge).toBeInTheDocument();

    // low confidence field
    const lowBadge = screen.getByTestId('confidence-badge-low');
    expect(lowBadge).toBeInTheDocument();
  });

  it('renders confidence summary counts', () => {
    render(<ReviewScreen {...defaultProps} />);
    // Summary shows 1 high, 1 medium, 1 low, 3 total
    const summaryNumbers = screen.getAllByText('1');
    expect(summaryNumbers.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows expand button for medium and low confidence fields', () => {
    render(<ReviewScreen {...defaultProps} />);
    const expandButtons = screen.getAllByLabelText('Expand');
    // medium + low = 2 expandable items
    expect(expandButtons.length).toBe(2);
  });

  it('expands to show evidence when expand button is clicked', () => {
    render(<ReviewScreen {...defaultProps} />);
    const expandButtons = screen.getAllByLabelText('Expand');
    // Click the first expandable item (medium confidence)
    fireEvent.click(expandButtons[0]);
    expect(screen.getByText('Industry: Technology (inferred)')).toBeInTheDocument();
  });

  it('does not show expand button for high confidence fields', () => {
    render(<ReviewScreen {...defaultProps} />);
    // Only 2 expand buttons for medium + low
    const expandButtons = screen.getAllByLabelText('Expand');
    expect(expandButtons.length).toBe(2);
  });

  it('calls onApprove when Approve button is clicked', () => {
    const onApprove = vi.fn();
    render(<ReviewScreen {...defaultProps} onApprove={onApprove} />);
    fireEvent.click(screen.getByText(/Approve/i));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('calls onRecrawlSection with the section name', () => {
    const onRecrawlSection = vi.fn();
    render(<ReviewScreen {...defaultProps} onRecrawlSection={onRecrawlSection} />);
    // Fields are grouped under 'general' section
    const recrawlButton = screen.getByText('Re-crawl Section');
    fireEvent.click(recrawlButton);
    expect(onRecrawlSection).toHaveBeenCalledWith('general');
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ReviewScreen {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onEditField after editing a field value', () => {
    const onEditField = vi.fn();
    render(<ReviewScreen {...defaultProps} onEditField={onEditField} />);

    // Click Edit on the first field (Acme Corp - high confidence)
    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    const input = screen.getByDisplayValue('Acme Corp');
    fireEvent.change(input, { target: { value: 'Acme Corporation' } });
    fireEvent.click(screen.getByText('Save'));

    expect(onEditField).toHaveBeenCalledWith('general.companyName', 'Acme Corporation');
  });

  it('shows empty state when no fields are provided', () => {
    render(<ReviewScreen {...defaultProps} fields={{}} />);
    expect(screen.getByText(/No fields extracted yet/i)).toBeInTheDocument();
  });
});
