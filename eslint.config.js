const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
	{
		ignores: ['dist/**'],
	},
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'commonjs',
			globals: globals.node,
		},
		rules: {
			'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
		},
	},
];
