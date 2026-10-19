import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction, type Message } from 'discord.js';
import {
	createReplySender,
	deleteAfter,
	ERROR_LIFETIME_MS,
	isFileTooLargeError,
	isPdfAttachment,
	NOTICE_LIFETIME_MS,
	processAttachment,
	resolveUserMessage,
	throwAppError,
	type SendFiles,
} from '../pdf';

export = {
	data: new SlashCommandBuilder()
		.setName('pdf')
		.setDescription('PDFファイルを画像に変換します')
		.addAttachmentOption((option) => option
			.setName('file')
			.setDescription('変換するPDFファイル')
			.setRequired(true)),
	async execute(interaction: ChatInputCommandInteraction) {
		const guildName = interaction.guild?.name ?? 'DM';
		console.log(`[Command] pdf executed in ${guildName} by ${interaction.user.tag}`);

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

			await processAttachment(attachment, send, sharePdf);
			if (!pdfMessage) {
				const notice = await interaction.followUp({ content: 'PDFはサイズ上限を超えるため共有できませんでした。', flags: MessageFlags.Ephemeral });
				deleteAfter(NOTICE_LIFETIME_MS, () => interaction.deleteReply(notice));
			}
		} catch (error) {
			console.error('[Command] pdf failed:', error);
			const userMessage = resolveUserMessage(error);
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
				console.error('[Command] pdf error reply failed:', replyError);
			}
		}
	},
};
