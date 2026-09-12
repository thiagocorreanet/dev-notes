import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': [
        'error',
        {
          allowConstantExport: true,
          allowExportNames: [
            'buttonVariants',
            'badgeVariants',
            'tabsListVariants',
            'useSidebar',
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.tsx'],
    ignores: ['src/components/ui/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXOpeningElement[name.name=/^(button|input|textarea|select|option|label|dialog|table|progress)$/]',
          message:
            'Use the official component from @/components/ui. This project exclusively uses shadcn/ui.',
        },
      ],
    },
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  prettier,
])
