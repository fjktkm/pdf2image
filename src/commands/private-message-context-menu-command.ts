import { createPdfContextMenuCommand } from '../pdf-context-menu';

export = createPdfContextMenuCommand({
	name: 'PDF (Only visible to you)',
	nameLocalizations: { ja: 'PDF（自分だけに表示）' },
	isPrivate: true,
});
