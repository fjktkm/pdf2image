import { ContextMenuCommandBuilder, ApplicationCommandType, MessageFlags } from 'discord.js';
import type { MessageContextMenuCommandInteraction, Message, Attachment } from 'discord.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import https from 'https';
import type { IncomingMessage } from 'http';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

const downloadPdf = (url: string, filePath: string): Promise<void> => new Promise((resolve, reject) => {
	const file = createWriteStream(filePath);
	const request = https.get(url, (response: IncomingMessage) => {
		if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
			reject(new Error(`Failed to download file, status code: ${response.statusCode}`));
			return;
		}
		response.pipe(file);
	});

	request.on('error', reject);

	file.on('finish', () => {
		file.close(() => resolve());
	});

	file.on('error', async (err: Error) => {
		try {
			await fs.unlink(filePath);
		} catch (unlinkErr) {
			console.error(`Failed to delete file: ${unlinkErr}`);
		}
		reject(err);
	});
});

const convertPdfToWebps = async (pdfPath: string, webpPath: string): Promise<void> => {
	try {
		await execFileAsync('convert', ['-density', '150', '-alpha', 'remove', pdfPath, webpPath]);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`An error occurred while converting the PDF. Error: ${message}`);
	}
};

const sendWebps = async (targetMessage: Message, imageDir: string): Promise<void> => {
	const filenames = await fs.readdir(imageDir);
	const files = filenames.map(filename => path.join(imageDir, filename));
	const totalFiles = files.length;
	const firstMessageFiles = (totalFiles - 1) % 9 + 1;
	const subsequentMessageFiles = 9;

	for (let i = 0; i < totalFiles;) {
		const maxFilesInMessage = (i === 0) ? firstMessageFiles : subsequentMessageFiles;
		const filesToSend = files.slice(i, i + maxFilesInMessage);

		if (i === 0) {
			await targetMessage.reply({
				files: filesToSend,
				allowedMentions: { repliedUser: false }
			});
		} else {
			if ('send' in targetMessage.channel) {
				await targetMessage.channel.send({
					files: filesToSend
				});
			}
		}

		i += maxFilesInMessage;
	}
};

const cleanUp = async (filePath: string | undefined, dirPath: string | undefined): Promise<void> => {
	try {
		if (filePath) {
			await fs.unlink(filePath).catch(() => {});
		}
		if (dirPath) {
			await fs.rm(dirPath, { recursive: true, force: true });
		}
	} catch (error) {
		console.error('Cleanup error:', error);
	}
};

const processAttachment = async (
	targetMessage: Message,
	attachment: Attachment,
	updateProgress: (message: string) => Promise<void>
): Promise<void> => {
	let pdfPath: string | undefined;
	let imageDir: string | undefined;

	try {
		const originalFilename = path.basename(attachment.name, '.pdf');
		imageDir = await fs.mkdtemp(path.join(os.tmpdir(), originalFilename + "_"));
		pdfPath = path.join(path.dirname(imageDir), `${path.basename(imageDir)}.pdf`);
		const webpPath = path.join(imageDir, originalFilename + '_page_%03d.webp');

		await updateProgress(`Downloading...`);
		await downloadPdf(attachment.url, pdfPath);

		await updateProgress(`Converting...`);
		await convertPdfToWebps(pdfPath, webpPath);

		await updateProgress(`Sending...`);
		await sendWebps(targetMessage, imageDir);
	} catch (error) {
		console.error(`An error occurred while converting the PDF ${attachment.name} to webp. Error:`, error);
		throw new Error(`An error occurred while converting the PDF ${attachment.name} to webp.`);
	} finally {
		await cleanUp(pdfPath, imageDir);
	}
};

export = {
	data: new ContextMenuCommandBuilder()
		.setName('convertPDF')
		.setType(ApplicationCommandType.Message),
	async execute(interaction: MessageContextMenuCommandInteraction) {
		try {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const targetMessage = interaction.options.getMessage('message');
			if (!targetMessage) {
				await interaction.editReply({
					content: 'Could not find the target message.'
				});
				return;
			}

			const attachments = Array.from(targetMessage.attachments.values());

			if (attachments.length === 0) {
				await interaction.editReply({
					content: 'No files were attached.'
				});
				return;
			}

			const pdfAttachments = attachments.filter(attachment => attachment.name?.endsWith('.pdf'));

			if (pdfAttachments.length === 0) {
				await interaction.editReply({
					content: 'No PDF files were attached.'
				});
				return;
			}

			const updateProgress = async (message: string) => {
				await interaction.editReply({ content: message });
			};

			for (let i = 0; i < pdfAttachments.length; i++) {
				const attachment = pdfAttachments[i];
				const progress = pdfAttachments.length > 1
					? `[${i + 1}/${pdfAttachments.length}] `
					: '';

				await processAttachment(targetMessage, attachment, async (msg) => {
					await updateProgress(progress + msg);
				});
			}

			await interaction.deleteReply();
		} catch (error) {
			console.error(error);
			const message = error instanceof Error ? error.message : 'An unknown error occurred';
			await interaction.editReply({
				content: message
			});
		}
	},
};
