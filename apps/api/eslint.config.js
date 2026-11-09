import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src/generated', 'scripts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'off',
      // Decorator-based DI requires runtime imports of classes used only as types.
    },
  },
  {
    // Raw SQL bypasses the tenant-scoped client. Allow-listed files only (none in Phase 1 except health).
    files: ['src/**/*.ts'],
    ignores: ['src/infra/health/**', 'src/**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name=/^\\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)$/]",
          message: 'Raw SQL is banned outside the allow-list (see docs/03-TENANCY-AND-AUTHORIZATION.md).',
        },
      ],
    },
  },
);
