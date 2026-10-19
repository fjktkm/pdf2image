import {
	ActionRowBuilder,
	ApplicationCommandType,
	ComponentType,
	ContextMenuCommandBuilder,
	MessageFlags,
	StringSelectMenuBuilder,
	type MessageContextMenuCommandInteraction,
	type StringSelectMenuInteraction,
} from 'discord.js';
import {
	createReplySender,
	deleteAfter,
	ERROR_LIFETIME_MS,
	isPdfAttachment,
	NOTICE_LIFETIME_MS,
	processAttachment,
	resolveUserMessage,
	throwAppError,
} from '../pdf';
import { t, toLocale } from '../i18n';

const SELECTION_TIMEOUT_MS = 14 * 60 * 1000;

export = {
	data: new ContextMenuCommandBuilder().setName('PDF').setType(ApplicationCommandType.Message),
	async execute(interaction: MessageContextMenuCommandInteraction) {
		const guildName = interaction.guild?.name ?? 'DM';
		console.log(`[Command] PDF executed in ${guildName} by ${interaction.user.tag}`);
		const locale = toLocale(interaction.locale);

		let responder: MessageContextMenuCommandInteraction | StringSelectMenuInteraction = interaction;
		let menuShown = false;
		const deleteRepliesAfter = (delayMs: number) => {
			deleteAfter(delayMs, () => responder.deleteReply());
			if (menuShown) {
				deleteAfter(delayMs, () => interaction.deleteReply());
			}
		};
		try {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const message = interaction.targetMessage;

			const pdfAttachments = Array.from(message.attachments.values()).filter(isPdfAttachment);
			if (pdfAttachments.length === 0) {
				throwAppError(message.attachments.size === 0 ? 'NO_ATTACHMENTS' : 'NO_PDF_ATTACHMENTS');
			}

			let attachment = pdfAttachments[0]!;
			if (pdfAttachments.length > 1) {
				const customId = `PDF:${interaction.id}`;
				const buildMenuRow = (selectedId?: string) => new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
					new StringSelectMenuBuilder()
						.setCustomId(customId)
						.setPlaceholder(t(locale, 'SELECT_PDF_PLACEHOLDER'))
						.setDisabled(selectedId !== undefined)
						.addOptions(pdfAttachments.map((pdf) => ({
							label: (pdf.title ?? pdf.name).slice(0, 100),
							value: pdf.id,
							default: pdf.id === selectedId,
						}))),
				);
				const reply = await interaction.editReply({ components: [buildMenuRow()] });
				menuShown = true;

				const selection = await reply.awaitMessageComponent({
					componentType: ComponentType.StringSelect,
					filter: (component) => component.customId === customId && component.user.id === interaction.user.id,
					time: SELECTION_TIMEOUT_MS,
				}).catch(() => undefined);
				if (!selection) {
					await interaction.deleteReply().catch(() => { });
					return;
				}
				responder = selection;
				attachment = pdfAttachments.find((pdf) => pdf.id === selection.values[0])!;
				await selection.deferReply({ flags: MessageFlags.Ephemeral });
				await interaction.editReply({ components: [buildMenuRow(attachment.id)] });
			}

			await processAttachment(attachment, createReplySender(message));
			await responder.editReply({ content: t(locale, 'CONVERSION_COMPLETED'), components: [] });
			deleteRepliesAfter(NOTICE_LIFETIME_MS);
		} catch (error) {
			console.error('[Command] PDF failed:', error);
			const userMessage = resolveUserMessage(error, locale);
			try {
				await responder.editReply({ content: userMessage, components: [] });
				deleteRepliesAfter(ERROR_LIFETIME_MS);
			} catch (replyError) {
				console.error('[Command] editReply failed, trying followUp:', replyError);
				try {
					const sent = await responder.followUp({ content: userMessage, flags: MessageFlags.Ephemeral });
					deleteAfter(ERROR_LIFETIME_MS, () => responder.deleteReply(sent));
				} catch (followUpError) {
					console.error('[Command] followUp also failed:', followUpError);
				}
			}
		}
	},
};
