import prettier from 'eslint-plugin-prettier'
import react from 'eslint-plugin-react'
import globals from 'globals'
import typescriptEslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default [
  {
    ignores: ['**/build', 'src/Map/data'],
  },
  ...compat.extends(
    'eslint:recommended',
    'prettier',
    'plugin:react/recommended'
  ),
  {
    plugins: {
      prettier,
      react,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },

      ecmaVersion: 'latest',
      sourceType: 'module',

      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },

    settings: {
      react: {
        pragma: 'React',
        version: 'detect',
      },
    },

    rules: {
      'standard/computed-property-even-spacing': 0,
      semi: 0,
      'react/display-name': 0,
      curly: 2,
      'dot-notation': 2,
      'no-const-assign': 2,
      'no-dupe-class-members': 2,
      'no-empty': 0,
      'no-else-return': 2,
      'no-inner-declarations': 2,
      'no-lonely-if': 2,
      'no-shadow': 1,
      'no-unneeded-ternary': 2,
      'no-unused-expressions': 2,
      'no-unused-vars': 'off',
      'no-useless-return': 2,
      'no-var': 2,
      'one-var': [2, 'never'],
      'prefer-arrow-callback': 2,
      'prefer-const': 2,
      'prefer-promise-reject-errors': 2,

      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto',
        },
      ],

      'sort-imports': 0,
      'sort-keys': [0],
      'sort-vars': 2,
      strict: [2, 'global'],
    },
  },
  {
    files: ['**/*.jsx', '**/*.js'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],

    plugins: {
      '@typescript-eslint': typescriptEslint,
    },

    languageOptions: {
      parser: tsParser,
    },
  },
]
