const js = require('@eslint/js');

module.exports = [
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'commonjs',
			globals: {
				console: 'readonly',
				process: 'readonly',
				__dirname: 'readonly',
				require: 'readonly',
				module: 'readonly',
				exports: 'readonly',
			},
		},
		rules: {
			'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
		},
	},
];
