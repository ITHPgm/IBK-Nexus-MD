module.exports = {
  apps: [{
    name: 'ibk-nexus-md',
    script: 'src/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '700M',
    time: true,
    env: { NODE_ENV: 'production' }
  }]
};
