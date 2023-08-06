const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const convert = require('pdf-poppler');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
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

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('convertPDF')
        .setType(ApplicationCommandType.Message),
    async execute(interaction) {
        await interaction.deferReply();

        const attachment = interaction.options.getMessage('message').attachments.first();
        if (!attachment) {
            await interaction.editReply({ content: 'No file was attached.', ephemeral: true });
            return;
        }
        if (!attachment.name.endsWith('.pdf')) {
            await interaction.editReply({ content: 'The attached file is not a PDF.', ephemeral: true });
            return;
        }

        const originalFilename = path.basename(attachment.name, '.pdf');
        const tempDir = os.tmpdir();
        const pdfPath = path.join(tempDir, `${originalFilename}.pdf`);
        const imageDir = path.join(tempDir, originalFilename);
        if (!fs.existsSync(imageDir)) {
            fs.mkdirSync(imageDir);
        }

        try {
            await downloadPDF(attachment.url, pdfPath);
            const opts = {
                format: 'png',
                out_dir: imageDir,
                out_prefix: originalFilename,
                scale: 4096
            };
            await convert.convert(pdfPath, opts);
            await sendImages(interaction, imageDir);
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'An error occurred while converting the PDF to images.', ephemeral: true });
        } finally {
            fs.unlinkSync(pdfPath);
            fs.rmSync(imageDir, { recursive: true });
        }
    },
};
