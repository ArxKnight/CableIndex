module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    // Existing codebase uses `any` in a few places (API glue, tests).
    // Keep lint useful without turning it into a rewrite project.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',

    // We intentionally don’t enforce exhaustive deps everywhere yet.
    'react-hooks/exhaustive-deps': 'off',

    // Avoid blocking dev flow on Fast Refresh export shape warnings.
    'react-refresh/only-export-components': 'off',
  },
}