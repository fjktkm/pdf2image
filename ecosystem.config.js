module.exports = {
    apps: [
        {
            name: 'my-app',
            script: './app.js', // あなたのエントリポイントへのパス
            instances: 1,
            autorestart: true,
            watch: false,
        },
    ],
};
