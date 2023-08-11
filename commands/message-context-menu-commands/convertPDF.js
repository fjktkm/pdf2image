const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const pdf2image = require('pdf2image');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const downloadPDF = (url, path) => new Promise((resolve, reject) => {
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

const sendImages = async (targetMessage, imageDir) => {
    const filenames = await fs.promises.readdir(imageDir);
    const files = filenames.map(filename => path.join(imageDir, filename));

    const firstMessageFiles = 10;
    const subsequentMessageFiles = 9;

    for (let i = 0; i < files.length;) {
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

const processPDF = async (attachment) => {
    const originalFilename = path.basename(attachment.name, '.pdf');
    const imageDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), originalFilename + "_"));
    const pdfPath = path.join(path.dirname(imageDir), `${path.basename(imageDir)}.pdf`);

    try {
        await downloadPDF(attachment.url, pdfPath);
        const converter = pdf2image.compileConverter({
            density: 200,
            outputFormat: path.join(imageDir, originalFilename + '_page_%d'),
            outputType: 'png',
            backgroundColor: '#FFFFFF'
        });
        await converter.convertPDF(pdfPath);
    } catch (error) {
        console.error(`An error occurred while converting the PDF ${attachment.name} to images. Error:`, error);
        throw new Error(`An error occurred while converting the PDF ${attachment.name} to images.`);
    }
    return { imageDir, pdfPath };
};

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('convertPDF')
        .setType(ApplicationCommandType.Message),
    async execute(interaction) {
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

        try {
            const paths = await Promise.all(pdfAttachments.map(attachment => processPDF(attachment)));

            for (const { imageDir, pdfPath } of paths) {
                await sendImages(targetMessage, imageDir);
                cleanUp(pdfPath, imageDir);
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

