const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const downloadPdf = (url, path) => new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(path);
    const request = https.get(url, response => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Failed to download file, status code: ${response.statusCode}`));
            return;
        }
        response.pipe(stream);
    });

    request.on('error', reject);

    stream.on('finish', resolve);

    stream.on('error', err => {
        fs.unlink(path, unlinkErr => {
            if (unlinkErr) {
                console.error(`Failed to delete file: ${unlinkErr}`);
            }
            reject(err);
        });
    });
});

const convertPdfToWebps = (pdfPath, webpPath) => {
    const command = `convert -density 150 -alpha remove ${pdfPath} ${webpPath}`;

    return new Promise((resolve, reject) => {
        exec(command, (error) => {
            if (error) {
                const errorMessage = `An error occurred while converting the PDF. Error: ${error}`;
                reject(new Error(errorMessage));
                return;
            }
            resolve();
        });
    });
};

const sendWebps = async (targetMessage, imageDir) => {
    const filenames = await fs.promises.readdir(imageDir);
    const files = filenames.map(filename => path.join(imageDir, filename));
    const totalFiles = files.length;
    const firstMessageFiles = (totalFiles - 1) % 9 + 1;
    const subsequentMessageFiles = 9;

    for (let i = 0; i < totalFiles;) {
        const maxFilesInMessage = (i === 0) ? firstMessageFiles : subsequentMessageFiles;
        const filesToSend = files.slice(i, i + maxFilesInMessage).filter(file => fs.existsSync(file));

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

const cleanUp = (filePath, dirPath) => {
    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    if (dirPath && fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true });
    }
};

const processAttachment = async (targetMessage, attachment) => {
    try {
        const originalFilename = path.basename(attachment.name, '.pdf');
        const imageDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), originalFilename + "_"));
        const pdfPath = path.join(path.dirname(imageDir), `${path.basename(imageDir)}.pdf`);
        const webpPath = path.join(imageDir, originalFilename + '_page_%03d.webp');

        await downloadPdf(attachment.url, pdfPath);
        await convertPdfToWebps(pdfPath, webpPath);
        await sendWebps(targetMessage, imageDir);

        cleanUp(pdfPath, imageDir);
    } catch (error) {
        console.error(`An error occurred while converting the PDF ${attachment.name} to webp. Error:`, error);
        throw new Error(`An error occurred while converting the PDF ${attachment.name} to webp.`);
    }
};

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('convertPDF')
        .setType(ApplicationCommandType.Message),
    async execute(interaction) {

        try {
            await interaction.deferReply({ ephemeral: true });

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
