import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlobalErrorBoundary } from './GlobalErrorBoundary';

// Component that throws on render
function Bomb(): React.JSX.Element {
  throw new Error('Test explosion');
}

describe('GlobalErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <GlobalErrorBoundary>
        <div>Hello World</div>
      </GlobalErrorBoundary>,
    );
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    // Suppress console.error from React's error boundary logging
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <GlobalErrorBoundary>
        <Bomb />
      </GlobalErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Reload Page')).toBeInTheDocument();
    expect(screen.getByText('Go Home')).toBeInTheDocument();

    spy.mockRestore();
  });

  it('Reload Page button triggers window.location.reload', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    const user = userEvent.setup();

    render(
      <GlobalErrorBoundary>
        <Bomb />
      </GlobalErrorBoundary>,
    );

    await user.click(screen.getByText('Reload Page'));
    expect(reloadMock).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('Go Home link points to /', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <GlobalErrorBoundary>
        <Bomb />
      </GlobalErrorBoundary>,
    );

    const link = screen.getByText('Go Home');
    expect(link).toHaveAttribute('href', '/');

    spy.mockRestore();
  });
});
