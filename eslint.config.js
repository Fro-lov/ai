import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  eslint.configs.recommended,

  {
    files: ['src/**/*.ts'],

    languageOptions: {
      parser: tsparser,

      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },

    plugins: {
      '@typescript-eslint': tseslint,
    },

    rules: {
      // TypeScript сам корректно обрабатывает unused vars,
      // поэтому отключаем стандартное ESLint правило.
      'no-unused-vars': 'off',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/no-explicit-any': 'warn',

      'no-console': 'off',
    },
  },
];