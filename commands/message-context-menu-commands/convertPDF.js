const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const convert = require('pdf-poppler');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const maxFilesPerMessage = 10;

const downloadPDF = (url, path) => {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            const stream = fs.createWriteStream(path);
            response.pipe(stream);
            stream.on('finish', resolve);
            stream.on('error', reject);
        });
    });
};

const createUniqueTempDir = (tempDir, originalFilename) => {
    const uniqueId = uuidv4();
    const uniqueDir = path.join(tempDir, `${originalFilename}_${uniqueId}`);
    if (!fs.existsSync(uniqueDir)) {
        fs.mkdirSync(uniqueDir);
    }
    return uniqueDir;
};

const sendImages = async (interaction, imageDir) => {
    const files = fs.readdirSync(imageDir).map(filename => `${imageDir}/${filename}`);
    for (let i = 0; i < files.length; i += maxFilesPerMessage) {
        const filesToSend = files.slice(i, i + maxFilesPerMessage);
        if (i === 0) {
            await interaction.editReply({ files: filesToSend });
        } else {
            await interaction.followUp({ files: filesToSend });
        }
    }
};

const cleanUp = (filePath, dirPath) => {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        if (dirPath && fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true });
        }
    } catch (error) {
        console.error('Error cleaning up temporary files:', error);
    }
};

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('convertPDF')
        .setType(ApplicationCommandType.Message),
    async execute(interaction) {

        const attachment = interaction.options.getMessage('message').attachments.first();
        if (!attachment) {
            await interaction.reply({ content: 'No file was attached.', ephemeral: true });
            return;
        }
        if (!attachment.name.endsWith('.pdf')) {
            await interaction.reply({ content: 'The attached file is not a PDF.', ephemeral: true });
            return;
        }

        await interaction.deferReply();

        const originalFilename = path.basename(attachment.name, '.pdf');
        const tempDir = os.tmpdir();
        const imageDir = createUniqueTempDir(tempDir, originalFilename);
        const pdfPath = path.join(path.dirname(imageDir), `${path.basename(imageDir)}.pdf`);

        try {
            await downloadPDF(attachment.url, pdfPath);
            const opts = {
                format: 'png',
                out_dir: imageDir,
                out_prefix: originalFilename,
                scale: 2048
            };
            await convert.convert(pdfPath, opts);
            await sendImages(interaction, imageDir);
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'An error occurred while converting the PDF to images.', ephemeral: true });
        } finally {
            cleanUp(pdfPath, imageDir);
        }
    },
};
