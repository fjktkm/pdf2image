import { execFile } from 'child_process';
import type { Attachment, Message } from 'discord.js';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import type { IncomingMessage } from 'http';
import https from 'https';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const DOWNLOAD_TIMEOUT_MS = 120_000;
const CONVERT_TIMEOUT_MS = 120_000;
const PROCESS_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BASE_FILENAME_LENGTH = 64;
export const NOTICE_LIFETIME_MS = 3_000;
export const ERROR_LIFETIME_MS = 60_000;

const DPI = 150;

const CHECK_BOT_PERMISSIONS_MESSAGE = 'Botの権限設定を確認してください。';
const GENERIC_ERROR = '変換処理に失敗しました。時間をおいて再試行してください。';
const TIMEOUT_RETRY = '処理がタイムアウトしました。PDFのページ数を減らして再試行してください。';

const APP_ERROR_MESSAGES = {
	PROCESS_TIMEOUT: '処理時間が上限を超えました。PDFのページ数を減らして再試行してください。',
	NO_ATTACHMENTS: 'ファイルが添付されていません。',
	NO_PDF_ATTACHMENTS: 'PDFファイルが添付されていません。',
	DOWNLOAD_FAILED: 'PDFのダウンロードに失敗しました。時間をおいて再試行してください。',
	UPLOAD_GENERATION_FAILED: '画像の生成に失敗しました。別のPDFで再試行してください。',
	CHANNEL_SEND_UNAVAILABLE: `このチャンネルにはメッセージを送信できません。\n${CHECK_BOT_PERMISSIONS_MESSAGE}`,
	BOT_SEND_PERMISSION: `Botにメッセージ送信権限がありません。\n${CHECK_BOT_PERMISSIONS_MESSAGE}`,
	BOT_REQUIRED_PERMISSION: `Botに必要な権限がありません。\n${CHECK_BOT_PERMISSIONS_MESSAGE}`,
	IMAGE_TOO_LARGE: '画像サイズが大きすぎて送信できませんでした。\nページ数を減らして再試行してください。',
	CHANNEL_INFO_FAILED: 'チャンネル情報の取得に失敗しました。\nもう一度お試しください。',
	RATE_LIMIT: '送信が混み合っています。時間をおいて再試行してください。',
} as const;

type AppErrorCode = keyof typeof APP_ERROR_MESSAGES;

const DISCORD_ERROR_MAP: Record<string, AppErrorCode> = {
	'50001': 'BOT_SEND_PERMISSION',
	'50013': 'BOT_REQUIRED_PERMISSION',
	'40005': 'IMAGE_TOO_LARGE',
	ChannelNotCached: 'CHANNEL_INFO_FAILED',
	'429': 'RATE_LIMIT',
	'413': 'IMAGE_TOO_LARGE',
};

export const throwAppError = (code: AppErrorCode): never => {
	throw { code };
};

const getStepTimeoutMs = (deadlineAt: number, maxTimeoutMs: number): number => {
	const remainingMs = deadlineAt - Date.now();
	if (remainingMs <= 0) {
		throwAppError('PROCESS_TIMEOUT');
	}
	return Math.min(remainingMs, maxTimeoutMs);
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
	const timeoutPromise = new Promise<T>((_, reject) => {
		const timer = setTimeout(() => reject({ code: 'PROCESS_TIMEOUT' as const }), timeoutMs);
		if (typeof timer.unref === 'function') {
			timer.unref();
		}
	});

	return Promise.race([promise, timeoutPromise]);
};

export const isPdfAttachment = (attachment: Attachment): boolean => {
	const contentType = attachment.contentType?.toLowerCase();
	return contentType?.startsWith('application/pdf') || attachment.name.toLowerCase().endsWith('.pdf');
};

const sanitizeBaseFilename = (filename: string): string => {
	const base = filename.replace(/\.[^.]*$/, '');
	const sanitized = base
		.replace(/[\\/:*?"<>|[\]]/g, '_')
		.replace(/[\x00-\x1F\x7F]/g, '_')
		.trim();
	return (sanitized || 'file').slice(0, MAX_BASE_FILENAME_LENGTH);
};

const downloadPdf = async (url: string, filePath: string, timeoutMs: number): Promise<void> => {
	const cleanupFile = async (): Promise<void> => {
		try {
			await fs.unlink(filePath);
		} catch {
			// ignore cleanup errors
		}
	};

	await new Promise<void>((resolve, reject) => {
		const request = https.get(url, (response: IncomingMessage) => {
			void (async () => {
				if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
					console.error(`[Download] Failed with status code: ${response.statusCode}`, { statusCode: response.statusCode });
					response.resume();
					await cleanupFile();
					reject({ code: 'DOWNLOAD_FAILED' as const });
					return;
				}

				const file = createWriteStream(filePath);
				try {
					await pipeline(response, file);
					resolve();
				} catch (error) {
					console.error('[Download] Stream error:', error);
					await cleanupFile();
					reject(error);
				}
			})();
		});

		request.setTimeout(timeoutMs, () => {
			const timeoutError = new Error('ファイルのダウンロードがタイムアウトしました。') as NodeJS.ErrnoException;
			timeoutError.code = 'ETIMEDOUT';
			request.destroy(timeoutError);
		});

		request.on('error', (error) => {
			console.error('[Download] Request error:', error);
			void cleanupFile().finally(() => reject(error));
		});
	});
};

const getPdfPageCount = async (pdfPath: string, deadlineAt: number): Promise<number> => {
	const { stdout } = await execFileAsync('vipsheader', ['-f', 'n-pages', pdfPath], {
		timeout: getStepTimeoutMs(deadlineAt, CONVERT_TIMEOUT_MS),
	});
	const pageCount = Number.parseInt(String(stdout), 10);
	if (!Number.isInteger(pageCount) || pageCount < 1) {
		throwAppError('UPLOAD_GENERATION_FAILED');
	}
	return pageCount;
};

const convertPdfToWebps = async (
	pdfPath: string,
	imageDir: string,
	originalFilename: string,
	deadlineAt: number,
): Promise<string[]> => {
	const pageCount = await getPdfPageCount(pdfPath, deadlineAt);
	const files = Array.from({ length: pageCount }, (_, page) =>
		path.join(imageDir, `${originalFilename}_page_${String(page).padStart(3, '0')}.webp`));

	let nextPage = 0;
	let failed = false;
	const worker = async (): Promise<void> => {
		while (!failed && nextPage < pageCount) {
			const page = nextPage++;
			try {
				await execFileAsync(
					'vips',
					['flatten', `${pdfPath}[page=${page},dpi=${DPI}]`, files[page]!, '--background', '255'],
					{ timeout: getStepTimeoutMs(deadlineAt, CONVERT_TIMEOUT_MS) },
				);
			} catch (error) {
				failed = true;
				console.error(`[Convert] Failed on page ${page}:`, error);
				throw error;
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(os.availableParallelism(), pageCount) }, worker));

	return files;
};

export type SendFiles = (files: string[], index: number) => Promise<unknown>;

export const createReplySender = (targetMessage: Message): SendFiles => async (files, index) => {
	if (!targetMessage.channel) {
		throwAppError('CHANNEL_SEND_UNAVAILABLE');
	}

	if (targetMessage.channel.partial) {
		await targetMessage.channel.fetch();
	}

	if (index === 0) {
		return targetMessage.reply({ files, allowedMentions: { repliedUser: false } });
	}

	const sendableChannel = targetMessage.channel as { send?: (options: { files: string[] }) => Promise<unknown> };
	const send = sendableChannel.send?.bind(targetMessage.channel);
	if (typeof send !== 'function') {
		throwAppError('CHANNEL_SEND_UNAVAILABLE');
	}
	return (send as (options: { files: string[] }) => Promise<unknown>)({ files });
};

export const deleteAfter = (delayMs: number, remove: () => Promise<unknown>): void => {
	setTimeout(() => {
		remove().catch(() => { });
	}, delayMs);
};

export const isFileTooLargeError = (error: unknown): boolean => {
	const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
	return code === 40005 || status === 413;
};

const sendWebps = async (send: SendFiles, files: string[], deadlineAt: number): Promise<void> => {
	if (files.length === 0) {
		throwAppError('UPLOAD_GENERATION_FAILED');
	}

	const firstMessageFiles = (files.length - 1) % 9 + 1;
	for (let i = 0, messageIndex = 0; i < files.length; messageIndex++) {
		const chunkSize = messageIndex === 0 ? firstMessageFiles : 9;
		const filesToSend = files.slice(i, i + chunkSize);

		try {
			await withTimeout(send(filesToSend, messageIndex), getStepTimeoutMs(deadlineAt, PROCESS_TIMEOUT_MS));
		} catch (error) {
			if (error && typeof error === 'object') {
				const mapped = DISCORD_ERROR_MAP[String((error as { code?: unknown }).code)]
					?? DISCORD_ERROR_MAP[String((error as { status?: unknown }).status)];
				if (mapped) {
					throwAppError(mapped);
				}
			}
			throw error;
		}

		i += chunkSize;
	}
};

export const processAttachment = async (
	attachment: Attachment,
	send: SendFiles,
	onDownloaded?: (pdfPath: string) => Promise<void>,
): Promise<void> => {
	let pdfPath: string | undefined;
	let imageDir: string | undefined;
	const deadlineAt = Date.now() + PROCESS_TIMEOUT_MS;

	try {
		const originalFilename = sanitizeBaseFilename(attachment.name);
		imageDir = await fs.mkdtemp(path.join(os.tmpdir(), `${originalFilename}_`));
		pdfPath = path.join(path.dirname(imageDir), `${path.basename(imageDir)}.pdf`);

		await downloadPdf(attachment.url, pdfPath, getStepTimeoutMs(deadlineAt, DOWNLOAD_TIMEOUT_MS));
		await onDownloaded?.(pdfPath);
		const generatedFiles = await convertPdfToWebps(pdfPath, imageDir, originalFilename, deadlineAt);
		await sendWebps(send, generatedFiles, deadlineAt);
	} catch (error) {
		console.error(`[Process] Failed processing ${attachment.name}:`, error);
		throw error;
	} finally {
		try {
			await Promise.all([
				pdfPath ? fs.unlink(pdfPath).catch(() => { }) : undefined,
				imageDir ? fs.rm(imageDir, { recursive: true, force: true }) : undefined,
			]);
		} catch (cleanupError) {
			console.error('[Cleanup] Error:', cleanupError);
		}
	}
};

const resolveErrorMessage = (error: unknown): string => {
	const code = (error as { code?: unknown } | null)?.code;
	if (typeof code === 'string' && code in APP_ERROR_MESSAGES) {
		return APP_ERROR_MESSAGES[code as AppErrorCode] ?? GENERIC_ERROR;
	}

	if (error instanceof Error) {
		const err = error as { code?: unknown; killed?: unknown; signal?: unknown; message: string };
		if (
			err.code === 'ETIMEDOUT'
			|| err.code === 'ESOCKETTIMEDOUT'
			|| err.killed === true
			|| /timed out|timeout|タイムアウト/i.test(err.message)
		) {
			return TIMEOUT_RETRY;
		}
	}

	return GENERIC_ERROR;
};

export const resolveUserMessage = (error: unknown): string => `❌ ${resolveErrorMessage(error)}`;
