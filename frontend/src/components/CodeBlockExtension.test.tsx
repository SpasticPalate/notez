/**
 * Tests for CodeBlockView — the React node view inside CodeBlockExtension.
 *
 * We test the exported `CodeBlockView` component directly rather than going
 * through the full TipTap extension machinery, which requires a real DOM and
 * ProseMirror environment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CodeBlockView } from './CodeBlockExtension';
import type { NodeViewProps } from '@tiptap/react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal NodeViewProps stub. */
function makeProps(overrides: Partial<NodeViewProps> = {}): NodeViewProps {
  return {
    node: { textContent: 'console.log("hello");' } as NodeViewProps['node'],
    editor: null as unknown as NodeViewProps['editor'],
    getPos: vi.fn().mockReturnValue(0),
    decorations: [] as unknown as NodeViewProps['decorations'],
    innerDecorations: [] as unknown as NodeViewProps['innerDecorations'],
    selected: false,
    extension: {} as NodeViewProps['extension'],
    HTMLAttributes: {},
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    view: {} as NodeViewProps['view'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// NodeViewWrapper and NodeViewContent just render plain wrappers in tests.
vi.mock('@tiptap/react', async (importActual) => {
  const actual = await importActual<typeof import('@tiptap/react')>();
  return {
    ...actual,
    NodeViewWrapper: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div data-testid="node-view-wrapper" {...props}>{children}</div>
    ),
    NodeViewContent: ({ as: Tag = 'div' }: { as?: string }) => (
      <Tag data-testid="node-view-content" />
    ),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodeBlockView', () => {
  let writeTextMock: ReturnType<typeof vi.fn>;
  let originalClipboard: Clipboard;

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    vi.clearAllMocks();
  });

  it('renders a Copy button in idle state', () => {
    render(<CodeBlockView {...makeProps()} />);
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument();
  });

  it('shows "Copied!" after a successful clipboard write', async () => {
    render(<CodeBlockView {...makeProps()} />);
    const btn = screen.getByRole('button', { name: /copy code/i });

    await act(async () => {
      fireEvent.click(btn);
      await writeTextMock.mock.results[0]?.value;
    });

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('Copied!');
    });

    // Screen-reader live region should announce the result.
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
  });

  it('resets to idle 2 s after "Copied!" state', async () => {
    vi.useFakeTimers();

    render(<CodeBlockView {...makeProps()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy code/i }));
      await Promise.resolve(); // flush microtask (clipboard promise)
    });

    // Advance past the 2 s reset timer.
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    expect(screen.getByRole('button')).toHaveTextContent('Copy');

    vi.useRealTimers();
  });

  it('shows "Copy failed" after a clipboard error', async () => {
    writeTextMock.mockRejectedValue(new DOMException('NotAllowedError'));

    render(<CodeBlockView {...makeProps()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy code/i }));
      // Let the rejected promise settle
      await writeTextMock.mock.results[0]?.value.catch(() => {});
    });

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('Copy failed');
    });

    expect(screen.getByRole('status')).toHaveTextContent('Copy failed');
  });

  it('does not write to clipboard when the block is empty', async () => {
    const props = makeProps({
      node: { textContent: '   ' } as NodeViewProps['node'],
    });

    render(<CodeBlockView {...props} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy code/i }));
    });

    expect(writeTextMock).not.toHaveBeenCalled();
    // Button stays in idle state (no "Copied!" label).
    expect(screen.getByRole('button')).toHaveTextContent('Copy');
  });

  it('strips bidi/zero-width characters before writing to clipboard', async () => {
    const poisoned = 'safe\u202Ehidden\u200Btext';
    const props = makeProps({
      node: { textContent: poisoned } as NodeViewProps['node'],
    });

    render(<CodeBlockView {...props} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy code/i }));
      await writeTextMock.mock.results[0]?.value;
    });

    expect(writeTextMock).toHaveBeenCalledWith('safehiddentext');
  });

  it('prevents double-click from triggering a second copy', async () => {
    render(<CodeBlockView {...makeProps()} />);
    const btn = screen.getByRole('button', { name: /copy code/i });

    // First click
    await act(async () => {
      fireEvent.click(btn);
      await writeTextMock.mock.results[0]?.value;
    });

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('Copied!');
    });

    // Second click while in "copied" state — should be a no-op.
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(writeTextMock).toHaveBeenCalledTimes(1);
  });

  it('reads fresh text from editor state when getPos is available', async () => {
    const freshContent = 'fresh content from editor';
    const mockEditor = {
      state: {
        doc: {
          nodeAt: vi.fn().mockReturnValue({ textContent: freshContent }),
        },
      },
    };

    const props = makeProps({
      editor: mockEditor as unknown as NodeViewProps['editor'],
      // stale node prop — should NOT be used
      node: { textContent: 'stale content' } as NodeViewProps['node'],
      getPos: vi.fn().mockReturnValue(42),
    });

    render(<CodeBlockView {...props} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy code/i }));
      await writeTextMock.mock.results[0]?.value;
    });

    expect(writeTextMock).toHaveBeenCalledWith(freshContent);
  });
});
