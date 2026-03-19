import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DownloadScreen } from '../../src/panel/screens/DownloadScreen';

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

const makeBlob = () => new Blob(['fake docx content'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

const defaultProps = {
  documentBlob: makeBlob(),
  fieldSummary: { total: 40, filled: 35, flagged: 5 },
  onDownload: vi.fn(),
  onRegenerate: vi.fn(),
};

describe('DownloadScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Document Ready" when blob is available', () => {
    render(<DownloadScreen {...defaultProps} />);
    expect(screen.getByText('Document Ready')).toBeInTheDocument();
  });

  it('shows generating state when blob is null', () => {
    render(<DownloadScreen {...defaultProps} documentBlob={null} />);
    expect(screen.getByText('Generating Document…')).toBeInTheDocument();
  });

  it('displays field summary stats', () => {
    render(<DownloadScreen {...defaultProps} />);
    // Total, Filled, Flagged
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('35')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('displays the fill rate percentage', () => {
    render(<DownloadScreen {...defaultProps} />);
    // 35/40 = 87%
    expect(screen.getByText('88%')).toBeInTheDocument();
  });

  it('calls onDownload when Download button is clicked', () => {
    const onDownload = vi.fn();
    render(<DownloadScreen {...defaultProps} onDownload={onDownload} />);
    fireEvent.click(screen.getByText('Download Document'));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('does not call onDownload when blob is null (button disabled)', () => {
    const onDownload = vi.fn();
    render(<DownloadScreen {...defaultProps} documentBlob={null} onDownload={onDownload} />);
    fireEvent.click(screen.getByText('Download Document'));
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('calls onRegenerate when Re-generate button is clicked', () => {
    const onRegenerate = vi.fn();
    render(<DownloadScreen {...defaultProps} onRegenerate={onRegenerate} />);
    fireEvent.click(screen.getByText('Re-generate'));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('shows field label annotations', () => {
    render(<DownloadScreen {...defaultProps} />);
    expect(screen.getByText('Total Fields')).toBeInTheDocument();
    expect(screen.getByText('Filled')).toBeInTheDocument();
    expect(screen.getByText('Flagged')).toBeInTheDocument();
  });

  it('shows 0% fill rate when total is 0', () => {
    render(
      <DownloadScreen
        {...defaultProps}
        fieldSummary={{ total: 0, filled: 0, flagged: 0 }}
      />,
    );
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
