import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmProvider, useConfirm } from './ConfirmDialog';

function TestHarness({ onResult }: { onResult: (v: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button
      data-testid="trigger"
      onClick={async () => {
        const result = await confirm({
          title: 'Delete item?',
          message: 'This cannot be undone.',
          confirmText: 'Delete',
          cancelText: 'Keep',
          variant: 'danger',
        });
        onResult(result);
      }}
    >
      Open
    </button>
  );
}

function renderWithProvider(onResult = vi.fn()) {
  const utils = render(
    <ConfirmProvider>
      <TestHarness onResult={onResult} />
    </ConfirmProvider>,
  );
  return { ...utils, onResult };
}

describe('ConfirmDialog', () => {
  it('should resolve true when confirm is clicked', async () => {
    const user = userEvent.setup();
    const { onResult } = renderWithProvider();

    await user.click(screen.getByTestId('trigger'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('should resolve false when cancel is clicked', async () => {
    const user = userEvent.setup();
    const { onResult } = renderWithProvider();

    await user.click(screen.getByTestId('trigger'));
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('should resolve false when X button is clicked', async () => {
    const user = userEvent.setup();
    const { onResult } = renderWithProvider();

    await user.click(screen.getByTestId('trigger'));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('should resolve false on Escape key', async () => {
    const user = userEvent.setup();
    const { onResult } = renderWithProvider();

    await user.click(screen.getByTestId('trigger'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('should trap focus within the dialog', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByTestId('trigger'));

    // Dialog is open — autoFocus lands on the confirm button ("Delete")
    const deleteBtn = screen.getByRole('button', { name: 'Delete' });
    expect(document.activeElement).toBe(deleteBtn);

    // Tab forward from last focusable → should wrap to first (Close button)
    // Focusable order: Close (X), Keep, Delete
    await user.tab(); // Delete → wraps to Close
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));

    // Shift+Tab from first → should wrap to last (Delete)
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(deleteBtn);
  });

  it('should restore focus to the trigger element on close', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    const trigger = screen.getByTestId('trigger');
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Keep' }));

    // Dialog should be gone and focus should return to trigger
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    // requestAnimationFrame defer means we need a tick
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
