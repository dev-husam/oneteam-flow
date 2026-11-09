import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { en } from '@pt/i18n';
import { Dialog } from './dialog';

// jsdom has no <dialog> behavior: emulate the two methods the component relies on.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };

const show = (open: boolean, onClose = vi.fn()) =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Dialog open={open} onClose={onClose} title="Invite someone">
        <input aria-label="Email" />
      </Dialog>
    </NextIntlClientProvider>,
  );

describe('Dialog', () => {
  it('mounts its content only while open, so forms reset on every opening', () => {
    const { rerender } = show(false);
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <Dialog open onClose={() => undefined} title="Invite someone"><input aria-label="Email" /></Dialog>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Invite someone' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('closes from the close button', async () => {
    const onClose = vi.fn();
    show(true, onClose);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
