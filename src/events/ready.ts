import { Events } from 'discord.js';
import type { Client } from 'discord.js';

export = {
	name: Events.ClientReady,
	once: true,
	execute(client: Client<true>) {
		console.log(`Ready! Logged in as ${client.user.tag}`);
	},
};
