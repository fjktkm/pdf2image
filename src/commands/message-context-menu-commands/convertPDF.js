const { ContextMenuCommandBuilder, ApplicationCommandType, MessageFlags } = require('discord.js');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const https = require('https');
const os = require('os');
const path = require('path');

const execFileAsync = promisify(execFile);

const downloadPdf = (url, filePath) => new Promise((resolve, reject) => {
    const file = require('fs').createWriteStream(filePath);
    const request = https.get(url, response => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Failed to download file, status code: ${response.statusCode}`));
            return;
        }
        response.pipe(file);
    });

    request.on('error', reject);

    file.on('finish', () => {
        file.close(resolve);
    });

    file.on('error', async (err) => {
        try {
            await fs.unlink(filePath);
        } catch (unlinkErr) {
            console.error(`Failed to delete file: ${unlinkErr}`);
        }
        reject(err);
    });
});

const convertPdfToWebps = async (pdfPath, webpPath) => {
    try {
        await execFileAsync('convert', ['-density', '150', '-alpha', 'remove', pdfPath, webpPath]);
    } catch (error) {
        throw new Error(`An error occurred while converting the PDF. Error: ${error.message}`);
    }
};

const sendWebps = async (targetMessage, imageDir) => {
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
            await targetMessage.channel.send({
                files: filesToSend
            });
        }

        i += maxFilesInMessage;
    }
};

const cleanUp = async (filePath, dirPath) => {
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

const processAttachment = async (targetMessage, attachment) => {
    let pdfPath;
    let imageDir;

    try {
        const originalFilename = path.basename(attachment.name, '.pdf');
        imageDir = await fs.mkdtemp(path.join(os.tmpdir(), originalFilename + "_"));
        pdfPath = path.join(path.dirname(imageDir), `${path.basename(imageDir)}.pdf`);
        const webpPath = path.join(imageDir, originalFilename + '_page_%03d.webp');

        await downloadPdf(attachment.url, pdfPath);
        await convertPdfToWebps(pdfPath, webpPath);
        await sendWebps(targetMessage, imageDir);
    } catch (error) {
        console.error(`An error occurred while converting the PDF ${attachment.name} to webp. Error:`, error);
        throw new Error(`An error occurred while converting the PDF ${attachment.name} to webp.`);
    } finally {
        await cleanUp(pdfPath, imageDir);
    }
};

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('convertPDF')
        .setType(ApplicationCommandType.Message),
    async execute(interaction) {

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const targetMessage = interaction.options.getMessage('message');
            const attachments = Array.from(targetMessage.attachments.values());

            if (attachments.length === 0) {
                await interaction.editReply({
                    content: 'No files were attached.'
                });
                return;
            }

            const pdfAttachments = attachments.filter(attachment => attachment.name.endsWith('.pdf'));

            if (pdfAttachments.length === 0) {
                await interaction.editReply({
                    content: 'No PDF files were attached.'
                });
                return;
            }

            for (const attachment of pdfAttachments) {
                await processAttachment(targetMessage, attachment);
            }

            await interaction.deleteReply();
        } catch (error) {
            console.error(error);
            await interaction.editReply({
                content: error.message
            });
        }
    },
};
