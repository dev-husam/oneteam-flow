import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.next', 'next-env.d.ts', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Direction-aware layout: physical left/right utilities break RTL. Use logical ones (ms-, ps-, start-, end-).
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/(^|\\s)(ml|mr|pl|pr|left|right|text-left|text-right|rounded-l|rounded-r|border-l|border-r)-/]",
          message: 'Use logical Tailwind utilities (ms-, me-, ps-, pe-, start-, end-, text-start, text-end) so RTL works.',
        },
      ],
    },
  },
);
