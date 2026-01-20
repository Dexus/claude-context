import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Note: MCP tests are ignored because they may use mock patterns and dynamic requires
    // that conflict with strict TypeScript ESLint rules. Core package tests (if added) should
    // follow the same pattern if they encounter similar issues with test utilities.
    ignores: ['**/dist/', '**/node_modules/', '**/*.js', '**/*.d.ts', 'packages/mcp/src/__tests__/'],
  }
);
