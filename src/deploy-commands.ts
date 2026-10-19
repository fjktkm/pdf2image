import 'dotenv/config';
import { REST, Routes, Client, GatewayIntentBits } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger';

interface Command {
	data: {
		toJSON: () => unknown;
	};
	execute: (...args: unknown[]) => Promise<void>;
}

const commands: unknown[] = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file: string) => file.endsWith('.ts') || file.endsWith('.js'));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath) as Command;
	if ('data' in command && 'execute' in command) {
		commands.push(command.data.toJSON());
	} else {
		logger.warn({ filePath }, 'command is missing a required "data" or "execute" property');
	}
}

const token = process.env.TOKEN;

if (!token) {
	throw new Error('TOKEN environment variable is not set');
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
	if (!client.application) {
		throw new Error('Client application is not available');
	}
	const clientId = client.application.id;
	const rest = new REST({ version: '10' }).setToken(token);

	try {
		logger.info({ count: commands.length }, 'refreshing application commands');

		const data = await rest.put(
			Routes.applicationCommands(clientId),
			{ body: commands },
		) as unknown[];

		logger.info({ count: data.length }, 'reloaded application commands');
	} catch (error) {
		logger.error({ err: error }, 'failed to reload application commands');
		process.exitCode = 1;
	} finally {
		await client.destroy();
	}
});

client.login(token);
