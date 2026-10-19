import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction, type Message } from 'discord.js';
import {
	createReplySender,
	deleteAfter,
	ERROR_LIFETIME_MS,
	isFileTooLargeError,
	isPdfAttachment,
	isUserError,
	NOTICE_LIFETIME_MS,
	processAttachment,
	resolveUserMessage,
	throwAppError,
	type SendFiles,
} from '../pdf';
import { t, toLocale } from '../i18n';
import { logger } from '../logger';

export = {
	data: new SlashCommandBuilder()
		.setName('pdf')
		.setDescription('Convert a PDF file to images')
		.setDescriptionLocalizations({ ja: 'PDF ファイルを画像に変換します' })
		.addAttachmentOption((option) => option
			.setName('file')
			.setDescription('PDF file to convert')
			.setDescriptionLocalizations({ ja: '変換する PDF ファイル' })
			.setRequired(true)),
	async execute(interaction: ChatInputCommandInteraction) {
		const log = logger.child({
			command: 'pdf',
			interactionId: interaction.id,
			guildId: interaction.guildId,
			userId: interaction.user.id,
		});
		log.info('command executed');
		const locale = toLocale(interaction.locale);

		let responded = false;
		try {
			const attachment = interaction.options.getAttachment('file', true);
			if (!isPdfAttachment(attachment)) {
				throwAppError('NO_PDF_ATTACHMENTS');
			}

			await interaction.deferReply();

			const channel = interaction.channel ?? await interaction.client.channels.fetch(interaction.channelId);
			if (!channel?.isSendable()) {
				return throwAppError('CHANNEL_SEND_UNAVAILABLE');
			}

			let pdfMessage: Message | undefined;
			const sharePdf = async (pdfPath: string): Promise<void> => {
				if (attachment.size > interaction.attachmentSizeLimit) {
					return;
				}
				try {
					pdfMessage = await interaction.editReply({ files: [{ attachment: pdfPath, name: attachment.name }] });
					responded = true;
				} catch (error) {
					if (!isFileTooLargeError(error)) {
						throw error;
					}
				}
			};
			const send: SendFiles = async (files, index) => {
				if (pdfMessage) {
					return createReplySender(pdfMessage)(files, index);
				}
				if (responded) {
					return channel.send({ files });
				}
				const sent = await interaction.editReply({ files });
				responded = true;
				return sent;
			};

			await processAttachment(attachment, send, sharePdf, log);
			if (!pdfMessage) {
				log.warn({ sizeBytes: attachment.size, limitBytes: interaction.attachmentSizeLimit }, 'pdf not shared');
				const notice = await interaction.followUp({ content: t(locale, 'PDF_NOT_SHARED'), flags: MessageFlags.Ephemeral });
				deleteAfter(NOTICE_LIFETIME_MS, () => interaction.deleteReply(notice));
			}
		} catch (error) {
			log[isUserError(error) ? 'warn' : 'error']({ err: error }, 'command failed');
			const userMessage = resolveUserMessage(error, locale);
			try {
				if (!interaction.deferred) {
					await interaction.reply({ content: userMessage, flags: MessageFlags.Ephemeral });
					deleteAfter(ERROR_LIFETIME_MS, () => interaction.deleteReply());
					return;
				}
				if (!responded) {
					await interaction.deleteReply();
				}
				const sent = await interaction.followUp({ content: userMessage, flags: MessageFlags.Ephemeral });
				deleteAfter(ERROR_LIFETIME_MS, () => interaction.deleteReply(sent));
			} catch (replyError) {
				log.error({ err: replyError }, 'error reply failed');
			}
		}
	},
};
