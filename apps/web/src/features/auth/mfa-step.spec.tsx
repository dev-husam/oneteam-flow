import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@pt/api-client';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '@pt/i18n';
import { MfaStep } from './mfa-step';

const completeMfa = vi.fn();
vi.mock('@/lib/auth/auth-context', () => ({ useAuth: () => ({ completeMfa }) }));

const setup = () => {
  const onDone = vi.fn();
  const onExpired = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MfaStep mfaToken="pending" onDone={onDone} onExpired={onExpired} />
    </NextIntlClientProvider>,
  );
  return { onDone, onExpired, user: userEvent.setup() };
};

describe('MfaStep', () => {
  beforeEach(() => {
    completeMfa.mockReset();
  });

  it('keeps the button disabled until a full code is typed, then signs in', async () => {
    completeMfa.mockResolvedValue({});
    const { user, onDone } = setup();
    const button = screen.getByRole('button', { name: 'Verify' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Verification code'), '123456');
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(completeMfa).toHaveBeenCalledWith('pending', '123456');
  });

  it('shows a localized error for a wrong code and clears the field', async () => {
    completeMfa.mockRejectedValue(new ApiError('MFA_CODE_INVALID', 422));
    const { user, onDone } = setup();
    await user.type(screen.getByLabelText('Verification code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText(en.errors.MFA_CODE_INVALID)).toBeInTheDocument();
    expect(screen.getByLabelText('Verification code')).toHaveValue('');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('returns to the password step when the five-minute window has ended', async () => {
    completeMfa.mockRejectedValue(new ApiError('MFA_TOKEN_INVALID', 401));
    const { user, onExpired } = setup();
    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(onExpired).toHaveBeenCalled());
  });

  it('switches to recovery codes', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Use a recovery code' }));
    expect(screen.getByLabelText('Recovery code')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('xxxxx-xxxxx')).toBeInTheDocument();
  });
});
