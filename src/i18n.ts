export type Locale = 'ja' | 'en';

export const toLocale = (locale: string): Locale => (locale === 'ja' ? 'ja' : 'en');

const JA_CHECK_BOT_PERMISSIONS = 'Bot の権限設定を確認してください。';
const EN_CHECK_BOT_PERMISSIONS = 'Please check the bot\'s permission settings.';

const ja = {
	PROCESS_TIMEOUT: '処理時間が上限を超えました。PDF のページ数を減らして再試行してください。',
	NO_ATTACHMENTS: 'ファイルが添付されていません。',
	NO_PDF_ATTACHMENTS: 'PDF ファイルが添付されていません。',
	DOWNLOAD_FAILED: 'PDF のダウンロードに失敗しました。時間をおいて再試行してください。',
	UPLOAD_GENERATION_FAILED: '画像の生成に失敗しました。別の PDF で再試行してください。',
	CHANNEL_SEND_UNAVAILABLE: `このチャンネルにはメッセージを送信できません。\n${JA_CHECK_BOT_PERMISSIONS}`,
	BOT_SEND_PERMISSION: `Bot にメッセージ送信権限がありません。\n${JA_CHECK_BOT_PERMISSIONS}`,
	BOT_REQUIRED_PERMISSION: `Bot に必要な権限がありません。\n${JA_CHECK_BOT_PERMISSIONS}`,
	IMAGE_TOO_LARGE: '画像サイズが大きすぎて送信できませんでした。\nページ数を減らして再試行してください。',
	CHANNEL_INFO_FAILED: 'チャンネル情報の取得に失敗しました。\nもう一度お試しください。',
	RATE_LIMIT: '送信が混み合っています。時間をおいて再試行してください。',
	GENERIC_ERROR: '変換処理に失敗しました。時間をおいて再試行してください。',
	TIMEOUT_RETRY: '処理がタイムアウトしました。PDF のページ数を減らして再試行してください。',
	SELECT_PDF_PLACEHOLDER: '変換する PDF を選択してください',
	CONVERSION_COMPLETED: 'PDF 変換が完了しました。',
	PDF_NOT_SHARED: 'PDF はサイズ上限を超えるため共有できませんでした。',
} as const;

export type MessageKey = keyof typeof ja;

const en: Record<MessageKey, string> = {
	PROCESS_TIMEOUT: 'Processing took too long. Please try again with fewer pages.',
	NO_ATTACHMENTS: 'No files are attached.',
	NO_PDF_ATTACHMENTS: 'No PDF files are attached.',
	DOWNLOAD_FAILED: 'Failed to download the PDF. Please try again later.',
	UPLOAD_GENERATION_FAILED: 'Failed to generate images. Please try a different PDF.',
	CHANNEL_SEND_UNAVAILABLE: `Cannot send messages in this channel.\n${EN_CHECK_BOT_PERMISSIONS}`,
	BOT_SEND_PERMISSION: `The bot does not have permission to send messages.\n${EN_CHECK_BOT_PERMISSIONS}`,
	BOT_REQUIRED_PERMISSION: `The bot is missing required permissions.\n${EN_CHECK_BOT_PERMISSIONS}`,
	IMAGE_TOO_LARGE: 'The images were too large to send.\nPlease try again with fewer pages.',
	CHANNEL_INFO_FAILED: 'Failed to get channel information.\nPlease try again.',
	RATE_LIMIT: 'Sending is busy right now. Please try again later.',
	GENERIC_ERROR: 'Conversion failed. Please try again later.',
	TIMEOUT_RETRY: 'Processing timed out. Please try again with fewer pages.',
	SELECT_PDF_PLACEHOLDER: 'Select a PDF to convert',
	CONVERSION_COMPLETED: 'PDF conversion completed.',
	PDF_NOT_SHARED: 'The PDF could not be shared because it exceeds the size limit.',
};

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { ja, en };

export const t = (locale: Locale, key: MessageKey): string => MESSAGES[locale][key];
