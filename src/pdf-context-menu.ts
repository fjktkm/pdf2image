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
	createEphemeralSender,
	createReplySender,
	deleteAfter,
	ERROR_LIFETIME_MS,
	isPdfAttachment,
	isUserError,
	NOTICE_LIFETIME_MS,
	processAttachment,
	resolveUserMessage,
	throwAppError,
	type SendFiles,
} from './pdf';
import { t, toLocale } from './i18n';
import { logger } from './logger';

const SELECTION_TIMEOUT_MS = 14 * 60 * 1000;

interface PdfContextMenuOptions {
	name: string;
	nameLocalizations?: Partial<Record<'ja', string>>;
	isPrivate: boolean;
}

export const createPdfContextMenuCommand = ({ name, nameLocalizations, isPrivate }: PdfContextMenuOptions) => ({
	data: new ContextMenuCommandBuilder()
		.setName(name)
		.setNameLocalizations(nameLocalizations ?? {})
		.setType(ApplicationCommandType.Message),
	async execute(interaction: MessageContextMenuCommandInteraction) {
		const log = logger.child({
			command: name,
			interactionId: interaction.id,
			guildId: interaction.guildId,
			userId: interaction.user.id,
			private: isPrivate,
		});
		log.info('command executed');
		const locale = toLocale(interaction.locale);

		let responder: MessageContextMenuCommandInteraction | StringSelectMenuInteraction = interaction;
		let menuShown = false;
		let imagesSent = false;
		const deleteMenuAfter = (delayMs: number) => {
			if (menuShown) {
				deleteAfter(delayMs, () => interaction.deleteReply());
			}
		};
		const deleteRepliesAfter = (delayMs: number) => {
			deleteAfter(delayMs, () => responder.deleteReply());
			deleteMenuAfter(delayMs);
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

			if (isPrivate) {
				const sendEphemeral = createEphemeralSender(responder);
				const send: SendFiles = async (files, index) => {
					const sent = await sendEphemeral(files, index);
					imagesSent = true;
					return sent;
				};
				await processAttachment(attachment, send, undefined, log);
				deleteMenuAfter(NOTICE_LIFETIME_MS);
				return;
			}

			await processAttachment(attachment, createReplySender(message), undefined, log);
			await responder.editReply({ content: t(locale, 'CONVERSION_COMPLETED'), components: [] });
			deleteRepliesAfter(NOTICE_LIFETIME_MS);
		} catch (error) {
			log[isUserError(error) ? 'warn' : 'error']({ err: error }, 'command failed');
			const userMessage = resolveUserMessage(error, locale);
			const followUpError = async () => {
				const sent = await responder.followUp({ content: userMessage, flags: MessageFlags.Ephemeral });
				deleteAfter(ERROR_LIFETIME_MS, () => responder.deleteReply(sent));
			};
			try {
				if (imagesSent) {
					await followUpError();
					deleteMenuAfter(ERROR_LIFETIME_MS);
					return;
				}
				await responder.editReply({ content: userMessage, components: [] });
				deleteRepliesAfter(ERROR_LIFETIME_MS);
			} catch (replyError) {
				log.warn({ err: replyError }, 'editReply failed, trying followUp');
				try {
					await followUpError();
				} catch (followUpFailure) {
					log.error({ err: followUpFailure }, 'followUp failed');
				}
			}
		}
	},
});
