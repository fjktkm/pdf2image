import pino from 'pino';

export const logger = pino({
	level: process.env.LOG_LEVEL ?? 'info',
	timestamp: pino.stdTimeFunctions.isoTime,
	transport: process.stdout.isTTY && process.env.NODE_ENV !== 'production'
		? { target: 'pino-pretty' }
		: undefined,
	formatters: {
		level: (label) => ({ level: label }),
	},
});

export type Logger = typeof logger;
