import { Events } from 'discord.js';
import type { Client } from 'discord.js';
import { logger } from '../logger';

export = {
	name: Events.ClientReady,
	once: true,
	execute(client: Client<true>) {
		logger.info({ user: client.user.tag }, 'ready');
	},
};
