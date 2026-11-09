import { checkPassword } from '@pt/domain';
import { z } from 'zod';

// Messages are `validation.*` keys; the Field component translates them.
const email = z.string().trim().min(1, 'required').pipe(z.email('email'));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'required'),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'minLength').max(120, 'maxLength'),
  email,
  password: z
    .string()
    .min(1, 'required')
    .refine((value) => checkPassword(value).length === 0, 'weakPassword'),
  acceptTerms: z.boolean().refine((value) => value === true, 'mustAccept'),
});

export const forgotSchema = z.object({ email });

export const resetSchema = z.object({
  password: z
    .string()
    .min(1, 'required')
    .refine((value) => checkPassword(value).length === 0, 'weakPassword'),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotValues = z.infer<typeof forgotSchema>;
export type ResetValues = z.infer<typeof resetSchema>;
