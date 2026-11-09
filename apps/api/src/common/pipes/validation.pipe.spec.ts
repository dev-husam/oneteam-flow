import { IsEmail, IsString } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { createValidationPipe } from './validation.pipe.js';

class Dto {
  @IsEmail() email!: string;
  @IsString() name!: string;
}

describe('validation pipe', () => {
  const pipe = createValidationPipe();
  const run = (value: unknown) => pipe.transform(value, { type: 'body', metatype: Dto });

  it('passes valid input', async () => {
    await expect(run({ email: 'a@b.co', name: 'x' })).resolves.toMatchObject({ email: 'a@b.co' });
  });

  it('reports rule names (not English sentences) per field and rejects extra properties', async () => {
    await expect(run({ email: 'nope', name: 1, admin: true })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: {
        fields: expect.arrayContaining([
          { field: 'email', rules: ['isEmail'] },
          { field: 'name', rules: ['isString'] },
          { field: 'admin', rules: ['whitelistValidation'] },
        ]),
      },
    });
  });
});
