const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const pdf2image = require('pdf2image');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const maxFilesPerMessage = 10;

const downloadPDF = (url, path) => new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(path);
    https.get(url, response => response.pipe(stream));
    stream.on('finish', resolve);
    stream.on('error', reject);
});


const createUniqueTempDir = (tempDir, originalFilename) => {
    const uniqueId = uuidv4();
    const uniqueDir = path.join(tempDir, `${originalFilename}_${uniqueId}`);
    if (!fs.existsSync(uniqueDir)) {
        fs.mkdirSync(uniqueDir);
    }
    return uniqueDir;
};

const sendImages = async (targetMessage, imageDir) => {
    const files = fs.readdirSync(imageDir).map(filename => `${imageDir}/${filename}`);
    for (let i = 0; i < files.length; i += maxFilesPerMessage) {
        const filesToSend = files.slice(i, i + maxFilesPerMessage);
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

const processPDF = async (targetMessage, attachment) => {
    const originalFilename = path.basename(attachment.name, '.pdf');
    const tempDir = os.tmpdir();
    const imageDir = createUniqueTempDir(tempDir, originalFilename);
    const pdfPath = path.join(path.dirname(imageDir), `${path.basename(imageDir)}.pdf`);

    try {
        await downloadPDF(attachment.url, pdfPath);
        const converter = pdf2image.compileConverter({
            density: 300,
            outputFormat: path.join(imageDir, originalFilename + '_page_%d'),
            outputType: 'png',
            backgroundColor: '#FFFFFF'
        });
        await converter.convertPDF(pdfPath);
        await sendImages(targetMessage, imageDir);
    } catch (error) {
        console.error(error);
        await targetMessage.reply({
            content: `An error occurred while converting the PDF ${attachment.name} to images.`
        });
    } finally {
        cleanUp(pdfPath, imageDir);
    }
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
                content: 'No file was attached.'
            });
            return;
        }

        const pdfAttachments = attachments.filter(attachment => attachment.name.endsWith('.pdf'));

        if (pdfAttachments.length === 0) {
            const hasSingleAttachment = attachments.length === 1;
            if (hasSingleAttachment) {
                await interaction.editReply({
                    content: 'The attached file is not a PDF.'
                });
            } else {
                await interaction.editReply({
                    content: 'None of the attached files are PDFs.'
                });
            }
            return;
        }

        for (const attachment of pdfAttachments) {
            await processPDF(targetMessage, attachment);
        }
        await interaction.deleteReply();
    },
};
