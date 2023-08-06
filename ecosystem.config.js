module.exports = {
    apps: [
        {
            name: 'pdf2image',
            script: './index.js',
            instances: 1,
            autorestart: true,
            watch: false,
        },
    ],
};
