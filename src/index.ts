import 'dotenv/config';
import http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'node:fs';
import path from 'node:path';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, ClientEvents } from 'discord.js';

interface Command {
	data: {
		name: string;
		toJSON: () => unknown;
	};
	execute: (interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction) => Promise<void>;
}

interface Event {
	name: keyof ClientEvents;
	once?: boolean;
	execute: (...args: unknown[]) => void | Promise<void>;
}

declare module 'discord.js' {
	export interface Client {
		commands: Collection<string, Command>;
	}
}

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
	if (req.url === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
	} else {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end('Discord Bot is running');
	}
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
	console.log(`Server running on port ${port}`);
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection<string, Command>();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file: string) => file.endsWith('.ts') || file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath) as Command;
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file: string) => file.endsWith('.ts') || file.endsWith('.js'));

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath) as Event;
	if (event.once) {
		client.once(event.name, (...args: unknown[]) => event.execute(...args));
	} else {
		client.on(event.name, (...args: unknown[]) => event.execute(...args));
	}
}

const token = process.env.TOKEN;
if (!token) {
	throw new Error('TOKEN environment variable is not set');
}

client.login(token);
