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

const SELECTION_TIMEOUT_MS = 14 * 60 * 1000;

export = {
	data: new ContextMenuCommandBuilder().setName('PDF').setType(ApplicationCommandType.Message),
	async execute(interaction: MessageContextMenuCommandInteraction) {
		const guildName = interaction.guild?.name ?? 'DM';
		console.log(`[Command] PDF executed in ${guildName} by ${interaction.user.tag}`);

		let responder: MessageContextMenuCommandInteraction | StringSelectMenuInteraction = interaction;
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
				const menu = new StringSelectMenuBuilder()
					.setCustomId(customId)
					.setPlaceholder('変換するPDFを選択してください')
					.addOptions(pdfAttachments.map((pdf) => ({
						label: (pdf.title ?? pdf.name).slice(0, 100),
						value: pdf.id,
					})));
				const reply = await interaction.editReply({
					components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
				});

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
				await selection.update({
					content: '⏳ 選択したPDFを変換しています。',
					components: [],
				});
			}

			await processAttachment(attachment, createReplySender(message));
			await responder.editReply({ content: '✅ PDF変換が完了しました。', components: [] });
			deleteAfter(NOTICE_LIFETIME_MS, () => responder.deleteReply());
		} catch (error) {
			console.error('[Command] PDF failed:', error);
			const userMessage = resolveUserMessage(error);
			try {
				await responder.editReply({ content: userMessage, components: [] });
				deleteAfter(ERROR_LIFETIME_MS, () => responder.deleteReply());
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
