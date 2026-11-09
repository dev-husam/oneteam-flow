import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmButton } from './confirm-button';

describe('ConfirmButton', () => {
  it('needs two clicks: the first only arms it', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton confirmLabel="Click again" onConfirm={onConfirm}>
        Delete
      </ConfirmButton>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Click again' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('disarms itself after a few seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ConfirmButton confirmLabel="Click again" onConfirm={vi.fn()}>
        Delete
      </ConfirmButton>,
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('button', { name: 'Click again' })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    vi.useRealTimers();
  });
});
