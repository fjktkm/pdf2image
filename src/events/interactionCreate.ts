import { Events } from 'discord.js';
import type { Interaction } from 'discord.js';
import { logger } from '../logger';

export = {
	name: Events.InteractionCreate,
	async execute(interaction: Interaction) {
		if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			logger.error({ command: interaction.commandName }, 'command not found');
			return;
		}

		try {
			await command.execute(interaction);
		} catch (error) {
			logger.error({ err: error, command: interaction.commandName, interactionId: interaction.id }, 'command execution failed');
		}
	},
};
