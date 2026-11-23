module.exports = {
  apps: [
    {
      name: 'mythgram-backend',
      cwd: '/home/user/webapp',
      script: 'npx',
      args: 'tsx src/index.ts',
      env: {
        NODE_ENV: 'development',
        PORT: 1000,
        MYTHGRAM_START_DIR: '/home/user/webapp',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
    {
      name: 'mythgram-webui',
      cwd: '/home/user/webapp/webui',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        PORT: 2000,
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
