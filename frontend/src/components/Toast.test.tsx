import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './Toast';

// Helper component that triggers a toast on button click
function ToastTrigger({ message = 'Test message', variant = 'error' as const, duration = 5000 }) {
  const { showToast } = useToast();
  return <button onClick={() => showToast(message, variant, duration)}>Trigger</button>;
}

describe('Toast', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders toast when showToast is called', async () => {
    const user = userEvent.setup();

    render(
      <ToastProvider>
        <ToastTrigger message="Something failed" />
      </ToastProvider>,
    );

    await user.click(screen.getByText('Trigger'));
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('auto-dismisses after duration', async () => {
    const user = userEvent.setup();

    render(
      <ToastProvider>
        <ToastTrigger message="Temp toast" duration={100} />
      </ToastProvider>,
    );

    await user.click(screen.getByText('Trigger'));
    expect(screen.getByText('Temp toast')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Temp toast')).not.toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('can be manually dismissed', async () => {
    const user = userEvent.setup();

    render(
      <ToastProvider>
        <ToastTrigger message="Dismiss me" />
      </ToastProvider>,
    );

    await user.click(screen.getByText('Trigger'));
    expect(screen.getByText('Dismiss me')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
  });

  it('supports multiple toasts', async () => {
    const user = userEvent.setup();

    function MultiTrigger() {
      const { showToast } = useToast();
      return (
        <>
          <button onClick={() => showToast('Toast A')}>Trigger A</button>
          <button onClick={() => showToast('Toast B', 'success')}>Trigger B</button>
        </>
      );
    }

    render(
      <ToastProvider>
        <MultiTrigger />
      </ToastProvider>,
    );

    await user.click(screen.getByText('Trigger A'));
    await user.click(screen.getByText('Trigger B'));

    expect(screen.getByText('Toast A')).toBeInTheDocument();
    expect(screen.getByText('Toast B')).toBeInTheDocument();
  });

  it('caps at MAX_TOASTS (5) and evicts oldest', async () => {
    const user = userEvent.setup();

    function ManyTrigger() {
      const { showToast } = useToast();
      return (
        <>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} onClick={() => showToast(`Toast ${n}`)}>
              Trigger {n}
            </button>
          ))}
        </>
      );
    }

    render(
      <ToastProvider>
        <ManyTrigger />
      </ToastProvider>,
    );

    // Click all 6 triggers
    for (let i = 1; i <= 6; i++) {
      await user.click(screen.getByText(`Trigger ${i}`));
    }

    // Oldest toast (Toast 1) should be evicted, Toast 2-6 remain
    expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
    expect(screen.getByText('Toast 2')).toBeInTheDocument();
    expect(screen.getByText('Toast 6')).toBeInTheDocument();

    // Count dismiss buttons to verify exactly 5 toasts
    const dismissButtons = screen.getAllByLabelText('Dismiss');
    expect(dismissButtons).toHaveLength(5);
  });

  it('throws when useToast is used outside provider', () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<ToastTrigger />)).toThrow(
      'useToast must be used within <ToastProvider>',
    );

    spy.mockRestore();
  });
});
