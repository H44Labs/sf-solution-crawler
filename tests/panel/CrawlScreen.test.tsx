import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CrawlScreen } from '../../src/panel/screens/CrawlScreen';

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

const defaultProps = {
  events: [],
  fieldsFound: 0,
  fieldsTotal: 10,
  pendingQuestion: null,
  tokenUsage: { total: 1000, budget: 10000 },
  onAnswer: vi.fn(),
  onPause: vi.fn(),
  onCancel: vi.fn(),
};

describe('CrawlScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the activity log with events', () => {
    const events = ['Page loaded: Home', 'Field found: Company Name', 'Navigating to Contacts'];
    render(<CrawlScreen {...defaultProps} events={events} />);

    expect(screen.getByText('Page loaded: Home')).toBeInTheDocument();
    expect(screen.getByText('Field found: Company Name')).toBeInTheDocument();
    expect(screen.getByText('Navigating to Contacts')).toBeInTheDocument();
  });

  it('shows empty activity log placeholder when no events', () => {
    render(<CrawlScreen {...defaultProps} events={[]} />);
    expect(screen.getByText(/Waiting for activity/i)).toBeInTheDocument();
  });

  it('shows correct progress ratio in progress bar', () => {
    render(<CrawlScreen {...defaultProps} fieldsFound={7} fieldsTotal={10} />);
    // Check both the ratio display and the label
    expect(screen.getByText('7 / 10')).toBeInTheDocument();
    expect(screen.getByText('70% complete')).toBeInTheDocument();
  });

  it('shows 0% complete when no fields found', () => {
    render(<CrawlScreen {...defaultProps} fieldsFound={0} fieldsTotal={20} />);
    expect(screen.getByText('0 / 20')).toBeInTheDocument();
    expect(screen.getByText('0% complete')).toBeInTheDocument();
  });

  it('does not render QA card when pendingQuestion is null', () => {
    render(<CrawlScreen {...defaultProps} pendingQuestion={null} />);
    expect(screen.queryByText('Question')).not.toBeInTheDocument();
  });

  it('renders QA card when pendingQuestion is provided', () => {
    render(
      <CrawlScreen
        {...defaultProps}
        pendingQuestion={{
          question: 'What is the deployment type?',
          context: 'We need this to determine the correct template.',
        }}
      />,
    );
    expect(screen.getByText('What is the deployment type?')).toBeInTheDocument();
    expect(
      screen.getByText('We need this to determine the correct template.'),
    ).toBeInTheDocument();
  });

  it('calls onAnswer when QA card answer is submitted', () => {
    const onAnswer = vi.fn();
    render(
      <CrawlScreen
        {...defaultProps}
        onAnswer={onAnswer}
        pendingQuestion={{
          question: 'Is this a migration?',
          context: 'Helps us pick the right template.',
        }}
      />,
    );

    const textarea = screen.getByPlaceholderText(/Type your answer/i);
    fireEvent.change(textarea, { target: { value: 'Yes, it is a migration.' } });
    fireEvent.click(screen.getByText('Submit Answer'));

    expect(onAnswer).toHaveBeenCalledWith('Yes, it is a migration.');
  });

  it('calls onPause when Pause button is clicked', () => {
    const onPause = vi.fn();
    render(<CrawlScreen {...defaultProps} onPause={onPause} />);
    fireEvent.click(screen.getByText('Pause'));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<CrawlScreen {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('displays token usage', () => {
    render(
      <CrawlScreen {...defaultProps} tokenUsage={{ total: 5000, budget: 10000 }} />,
    );
    expect(screen.getByText('5,000 / 10,000')).toBeInTheDocument();
  });
});
