import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';

interface Command {
	data: {
		toJSON: () => unknown;
	};
	execute: (...args: unknown[]) => Promise<void>;
}

const commands: unknown[] = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file: string) => file.endsWith('.ts') || file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath) as Command;
		if ('data' in command && 'execute' in command) {
			commands.push(command.data.toJSON());
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token) {
	throw new Error('TOKEN environment variable is not set');
}

if (!clientId) {
	throw new Error('CLIENT_ID environment variable is not set');
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		const data = await rest.put(
			Routes.applicationCommands(clientId),
			{ body: commands },
		) as unknown[];

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		console.error(error);
	}
})();
