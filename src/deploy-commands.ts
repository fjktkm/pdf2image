import 'dotenv/config';
import { REST, Routes, Client, GatewayIntentBits } from 'discord.js';
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

if (!token) {
	throw new Error('TOKEN environment variable is not set');
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
	if (!client.application) {
		throw new Error('Client application is not available');
	}
	const clientId = client.application.id;
	const rest = new REST({ version: '10' }).setToken(token);

	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		const data = await rest.put(
			Routes.applicationCommands(clientId),
			{ body: commands },
		) as unknown[];

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		console.error(error);
	} finally {
		await client.destroy();
		process.exit(0);
	}
});

client.login(token);
