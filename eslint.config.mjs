// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs';

export default withNuxt([{

  rules: {
    // Off
    'vue/no-v-html': 'off',
    'vue/singleline-html-element-content-newline': 'off',

    // Errors
    '@typescript-eslint/no-unused-vars': 'error',
    'comma-dangle': ['error', {
      'arrays': 'always-multiline',
      'objects': 'always-multiline',
      'imports': 'never',
      'exports': 'never',
      'functions': 'never',
    }],
    'eol-last': ['error', 'always'],
    'indent': ['error', 2, { 'SwitchCase': 1 }],
    'keyword-spacing': ['error', { 'after': true, 'before': true }],
    'no-multiple-empty-lines': ['error', { 'max': 1 }],
    'object-curly-spacing': ['error', 'always'],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'space-before-blocks': 'error',
    'space-before-function-paren': ['error', 'never'],
    'vue/max-attributes-per-line': ['error', { 'singleline': 2 }],
    'vue/require-explicit-emits': 'error',
    'vue/v-on-event-hyphenation': 'error',

    // Warnings
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    'vue/multi-word-component-names': 'warn',
    /*    'vue/require-img-alt': ['warn', {
      'elements': ['img', 'NuxtImage', 'nuxt-image'],
    }],*/
    //'import/first': 'error',
    //'import/no-duplicates': 'error',

  },
}]);
