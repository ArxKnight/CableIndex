import { z } from 'zod';

export function normalizeUsername(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

const SPECIAL_CHAR_REGEX = /[^A-Za-z0-9\s]/;

export function passwordSchema(label: string): z.ZodString {
  return z
    .string()
    .min(8, `${label} must be at least 8 characters`)
    .regex(/[A-Z]/, `${label} must contain at least one uppercase letter`)
    .regex(/\d/, `${label} must contain at least one number`)
    .regex(SPECIAL_CHAR_REGEX, `${label} must contain at least one special character`);
}

export function usernameSchema(label: string, opts?: { max?: number; min?: number }): z.ZodEffects<z.ZodString, string, string> {
  const min = opts?.min ?? 1;
  const max = opts?.max ?? 100;

  return z
    .string()
    .min(min, `${label} is required`)
    .max(max, `${label} must be less than ${max} characters`)
    .transform((v) => normalizeUsername(v));
}
