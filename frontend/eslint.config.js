import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Mark variables used in JSX (incl. namespaced like <motion.div>) as used,
      // so core no-unused-vars doesn't false-positive on JSX-only references.
      'react/jsx-uses-vars': 'error',
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', caughtErrors: 'none' },
      ],
    },
  },
  // Node-context files: build scripts, config files. These run under Node,
  // not the browser, so they need Node globals (process, require, __dirname).
  {
    files: [
      '**/*.config.{js,cjs}',
      'scripts/**/*.{js,mjs,cjs}',
      'eslint.config.js',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Test files run under Vitest with globals enabled (describe, it, expect,
  // vi, …). Make those globals known to ESLint.
  {
    files: [
      '**/*.{test,spec}.{js,jsx}',
      '**/__tests__/**/*.{js,jsx}',
      'src/test/**/*.{js,jsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.vitest,
      },
    },
  },
])
