import { useState, useEffect, useRef } from 'react';
import CodeBlock from '@tiptap/extension-code-block';
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Copy } from 'lucide-react';

// Bidi override chars (U+202A–202E, U+2066–2069) and zero-width chars
// (U+200B–200F, U+FEFF) that can make clipboard content visually differ
// from what is displayed — strip before writing to clipboard to prevent
// pastejacking attacks.
const UNSAFE_UNICODE_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

type CopyState = 'idle' | 'copying' | 'copied' | 'failed';

// Explicit CSS class map — decouples internal state literals from class names.
const BTN_STATE_CLASS: Partial<Record<CopyState, string>> = {
  copying: 'code-block-copy-btn--copying',
  copied:  'code-block-copy-btn--copied',
  failed:  'code-block-copy-btn--failed',
};

// Show a visible 'loading' state for blocks above this threshold to signal
// that the synchronous textContent traversal is in progress.
const LARGE_BLOCK_THRESHOLD = 100_000;

export function CodeBlockView({ node, getPos, editor }: NodeViewProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const mountedRef = useRef(true);

  // Track whether the component is still mounted to guard async setCopyState
  // calls (clipboard promise resolves after component may have unmounted).
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reset to idle 2 s after a terminal state; cleanup cancels the timer if
  // the component unmounts or the state changes before the 2 s window.
  useEffect(() => {
    if (copyState !== 'copied' && copyState !== 'failed') return;
    const id = setTimeout(() => {
      if (mountedRef.current) setCopyState('idle');
    }, 2000);
    return () => clearTimeout(id);
  }, [copyState]);

  const handleCopy = async () => {
    // Prevent double-click race — only one copy operation in flight at a time.
    if (copyState !== 'idle') return;

    // Read fresh text from editor state at click time, bypassing the stale
    // `node` prop. ProseMirror replaces `node` by reference on every
    // transaction, so the prop may be one render frame behind in collab mode.
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    const freshNode = pos !== undefined && editor
      ? editor.state.doc.nodeAt(pos)
      : null;
    const text = (freshNode ?? node).textContent;

    // Don't show "Copied!" for an empty block — it would be misleading.
    if (!text.trim()) return;

    // Strip bidi/zero-width characters before writing to clipboard.
    const sanitized = text.replace(UNSAFE_UNICODE_RE, '');

    // Show a loading indicator for very large blocks so the user knows
    // the synchronous traversal has completed and the clipboard write is in
    // progress.
    if (text.length > LARGE_BLOCK_THRESHOLD) {
      setCopyState('copying');
    }

    try {
      await navigator.clipboard.writeText(sanitized);
      if (mountedRef.current) setCopyState('copied');
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Clipboard write failed:', err);
      if (mountedRef.current) setCopyState('failed');
    }
  };

  const stateClass = BTN_STATE_CLASS[copyState] ? ` ${BTN_STATE_CLASS[copyState]}` : '';
  const isActive = copyState !== 'idle';

  // In terminal states show a text label; in idle show icon + "Copy".
  const buttonContent =
    copyState === 'copied'  ? 'Copied!' :
    copyState === 'failed'  ? 'Copy failed' :
    copyState === 'copying' ? 'Copying…' :
    <><Copy size={12} aria-hidden="true" /><span>Copy</span></>;

  return (
    <NodeViewWrapper className="code-block-wrapper">
      {/* pre/code block comes first in DOM order so keyboard users encounter
          the code content before the copy action in the tab sequence. The
          button is repositioned visually to top-right via position:absolute. */}
      <pre>
        <NodeViewContent<'code'> as="code" />
      </pre>
      <button
        type="button"
        className={`code-block-copy-btn${stateClass}`}
        onClick={handleCopy}
        disabled={isActive}
        aria-label="Copy code"
      >
        {buttonContent}
      </button>
      {/* Screen-reader post-action announcement. The button's aria-label
          is intentionally kept static ("Copy code") — this live region alone
          owns the feedback to avoid double-announcements on NVDA/VoiceOver. */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {copyState === 'copied' ? 'Copied to clipboard' :
         copyState === 'failed' ? 'Copy failed' : ''}
      </span>
    </NodeViewWrapper>
  );
}

/**
 * Extends TipTap's built-in CodeBlock with a React node view that adds
 * a "Copy" button in the top-right corner of each code block.
 *
 * Usage: add this to getBaseExtensions() and pass `codeBlock: false`
 * to StarterKit to prevent the built-in from registering.
 *
 * Upgrade note: when syntax highlighting is added, this extension must be
 * refactored to extend `@tiptap/extension-code-block-lowlight` instead of
 * `@tiptap/extension-code-block`. CodeBlockLowlight has a different
 * constructor, different options (lowlight, defaultLanguage), and registers
 * an additional ProseMirror decoration plugin. See docs/known-issues.md.
 */
export const CodeBlockExtension = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});
