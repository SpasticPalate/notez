import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FeedbackModal } from './FeedbackModal';
import { ToastProvider } from './Toast';

// Mock the feedbackApi
vi.mock('../lib/api', () => ({
  feedbackApi: {
    submit: vi.fn(),
  },
}));

import { feedbackApi } from '../lib/api';
const mockSubmit = vi.mocked(feedbackApi.submit);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

describe('FeedbackModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    render(<FeedbackModal isOpen={false} onClose={onClose} />, {
      wrapper: createWrapper(),
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should render form when isOpen is true', () => {
    render(<FeedbackModal isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Share Your Feedback')).toBeInTheDocument();
    expect(screen.getByText('Send Feedback')).toBeInTheDocument();
  });

  it('should disable submit button when title is empty', () => {
    render(<FeedbackModal isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    });
    const submitButton = screen.getByRole('button', { name: /send feedback/i });
    expect(submitButton).toBeDisabled();
  });

  it('should enable submit button when title and description are filled', async () => {
    const user = userEvent.setup();
    render(<FeedbackModal isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    });

    const titleInput = screen.getByLabelText(/what would help/i);
    const descriptionInput = screen.getByLabelText(/describe your idea/i);

    await user.type(titleInput, 'Test feature');
    await user.type(descriptionInput, 'A great feature idea');

    const submitButton = screen.getByRole('button', { name: /send feedback/i });
    expect(submitButton).toBeEnabled();
  });

  it('should call feedbackApi.submit on form submit', async () => {
    const user = userEvent.setup();
    mockSubmit.mockResolvedValueOnce({ data: { message: 'ok' } } as any);

    render(<FeedbackModal isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    });

    await user.type(screen.getByLabelText(/what would help/i), 'New feature');
    await user.type(screen.getByLabelText(/describe your idea/i), 'Please add this');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith({
        type: 'FEATURE',
        title: 'New feature',
        description: 'Please add this',
        category: undefined,
        priority: undefined,
      });
    });
  });

  it('should show success message after successful submit', async () => {
    const user = userEvent.setup();
    mockSubmit.mockResolvedValueOnce({ data: { message: 'ok' } } as any);

    render(<FeedbackModal isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    });

    await user.type(screen.getByLabelText(/what would help/i), 'New feature');
    await user.type(screen.getByLabelText(/describe your idea/i), 'Please add this');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => {
      expect(screen.getByText('Thanks for your feedback!')).toBeInTheDocument();
    });
  });

  it('should show error alert when submit fails', async () => {
    const user = userEvent.setup();
    const axiosError = new Error('Request failed');
    (axiosError as any).isAxiosError = true;
    (axiosError as any).response = { status: 500, data: { message: 'Failed to submit feedback' } };
    mockSubmit.mockRejectedValueOnce(axiosError);

    render(<FeedbackModal isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    });

    await user.type(screen.getByLabelText(/what would help/i), 'New feature');
    await user.type(screen.getByLabelText(/describe your idea/i), 'Please add this');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toContain('Failed to submit feedback');
    });
  });

  it('should show network error message when request fails without response', async () => {
    const user = userEvent.setup();
    const networkError = new Error('Network Error');
    (networkError as any).isAxiosError = true;
    // No .response = network error
    mockSubmit.mockRejectedValueOnce(networkError);

    render(<FeedbackModal isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    });

    await user.type(screen.getByLabelText(/what would help/i), 'New feature');
    await user.type(screen.getByLabelText(/describe your idea/i), 'Please add this');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toContain('Network error');
    });
  });

  it('should toggle between BUG and FEATURE types', async () => {
    const user = userEvent.setup();
    render(<FeedbackModal isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    });

    // Default is FEATURE — label says "What would help?"
    expect(screen.getByLabelText(/what would help/i)).toBeInTheDocument();

    // Switch to BUG — label changes to "What went wrong?"
    await user.click(screen.getByText('Report a Problem'));
    expect(screen.getByLabelText(/what went wrong/i)).toBeInTheDocument();

    // Switch back to FEATURE
    await user.click(screen.getByText('Suggest Something'));
    expect(screen.getByLabelText(/what would help/i)).toBeInTheDocument();
  });
});
