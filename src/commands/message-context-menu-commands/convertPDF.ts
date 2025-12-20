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
	console.log(`[Download] Starting download`);
	const file = createWriteStream(filePath);
	const request = https.get(url, (response: IncomingMessage) => {
		if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
			console.error(`[Download] Failed with status code: ${response.statusCode}`);
			reject(new Error(`Failed to download file, status code: ${response.statusCode}`));
			return;
		}
		response.pipe(file);
	});

	request.on('error', (err) => {
		console.error(`[Download] Request error:`, err);
		reject(err);
	});

	file.on('finish', () => {
		console.log(`[Download] Completed`);
		file.close(() => resolve());
	});

	file.on('error', async (err: Error) => {
		console.error(`[Download] File write error:`, err);
		try {
			await fs.unlink(filePath);
		} catch (unlinkErr) {
			console.error(`[Download] Failed to delete file: ${unlinkErr}`);
		}
		reject(err);
	});
});

const convertPdfToWebps = async (pdfPath: string, webpPath: string): Promise<void> => {
	try {
		console.log(`[Convert] Starting conversion`);
		const startTime = Date.now();
		await execFileAsync('convert', ['-density', '150', '-alpha', 'remove', pdfPath, webpPath]);
		const duration = Date.now() - startTime;
		console.log(`[Convert] Completed in ${duration}ms`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[Convert] Failed:`, error);
		throw new Error(`An error occurred while converting the PDF. Error: ${message}`);
	}
};

const sendWebps = async (targetMessage: Message, imageDir: string): Promise<void> => {
	const filenames = await fs.readdir(imageDir);
	const files = filenames.map(filename => path.join(imageDir, filename));
	const totalFiles = files.length;
	console.log(`[Upload] Sending ${totalFiles} images`);
	const firstMessageFiles = (totalFiles - 1) % 9 + 1;
	const subsequentMessageFiles = 9;

	let messageCount = 0;
	for (let i = 0; i < totalFiles;) {
		const maxFilesInMessage = (i === 0) ? firstMessageFiles : subsequentMessageFiles;
		const filesToSend = files.slice(i, i + maxFilesInMessage);
		messageCount++;

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

		console.log(`[Upload] Sent message ${messageCount} with ${filesToSend.length} images`);
		i += maxFilesInMessage;
	}
	console.log(`[Upload] All images sent successfully`);
};

const cleanUp = async (filePath: string | undefined, dirPath: string | undefined): Promise<void> => {
	try {
		if (filePath) {
			await fs.unlink(filePath).catch(() => {});
		}
		if (dirPath) {
			await fs.rm(dirPath, { recursive: true, force: true });
		}
		console.log(`[Cleanup] Completed`);
	} catch (error) {
		console.error('[Cleanup] Error:', error);
	}
};

const processAttachment = async (
	targetMessage: Message,
	attachment: Attachment,
	updateProgress: (message: string) => Promise<void>
): Promise<void> => {
	let pdfPath: string | undefined;
	let imageDir: string | undefined;
	const startTime = Date.now();

	try {
		console.log(`[Process] Starting processing for: ${attachment.name} (${attachment.size} bytes)`);
		const originalFilename = path.basename(attachment.name, '.pdf');
		imageDir = await fs.mkdtemp(path.join(os.tmpdir(), originalFilename + "_"));
		pdfPath = path.join(path.dirname(imageDir), `${path.basename(imageDir)}.pdf`);
		const webpPath = path.join(imageDir, originalFilename + '_page_%03d.webp');

		await updateProgress(`Downloading`);
		await downloadPdf(attachment.url, pdfPath);

		await updateProgress(`Converting`);
		await convertPdfToWebps(pdfPath, webpPath);

		await updateProgress(`Uploading`);
		await sendWebps(targetMessage, imageDir);

		const duration = Date.now() - startTime;
		console.log(`[Process] Completed processing for: ${attachment.name} in ${duration}ms`);
	} catch (error) {
		console.error(`[Process] Failed processing ${attachment.name}:`, error);
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
		const startTime = Date.now();
		const guildName = interaction.guild?.name || 'DM';
		console.log(`[Command] convertPDF executed by ${interaction.user.tag} in ${guildName}`);

		try {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const targetMessage = interaction.options.getMessage('message');
			if (!targetMessage) {
				console.log(`[Command] Target message not found`);
				await interaction.editReply({
					content: 'Could not find the target message.'
				});
				return;
			}

			const attachments = Array.from(targetMessage.attachments.values());

			if (attachments.length === 0) {
				console.log(`[Command] No attachments found`);
				await interaction.editReply({
					content: 'No files were attached.'
				});
				return;
			}

			const pdfAttachments = attachments.filter(attachment => attachment.name?.endsWith('.pdf'));

			if (pdfAttachments.length === 0) {
				console.log(`[Command] No PDF attachments found`);
				await interaction.editReply({
					content: 'No PDF files were attached.'
				});
				return;
			}

			console.log(`[Command] Processing ${pdfAttachments.length} PDF(s)`);

			const updateProgress = async (message: string) => {
				await interaction.editReply({ content: message });
			};

			for (let i = 0; i < pdfAttachments.length; i++) {
				const attachment = pdfAttachments[i];
				const fileName = attachment.name || 'file';
				const counter = pdfAttachments.length > 1 ? `[${i + 1}/${pdfAttachments.length}] ` : '';

				await processAttachment(targetMessage, attachment, async (msg) => {
					await updateProgress(`${counter}${msg} ${fileName}...`);
				});
			}

			await interaction.deleteReply();
			const duration = Date.now() - startTime;
			console.log(`[Command] convertPDF completed successfully in ${duration}ms`);
		} catch (error) {
			console.error('[Command] convertPDF failed:', error);
			const message = error instanceof Error ? error.message : 'An unknown error occurred';
			await interaction.editReply({
				content: message
			});
		}
	},
};
