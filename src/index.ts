#!/usr/bin/env node
import 'dotenv/config';
import express from 'express';
import path from 'path';
import getPort, { portNumbers } from 'get-port';
import { internalIpV4 } from 'internal-ip';
import { CONFIG } from './config';
import apiRouter from './routes/api';
import { startScheduler } from './cron/scheduler';

const app = express();

app.use(express.json());

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// API 路由
app.use('/api', apiRouter);

// 首页
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  const port = await getPort({
    port: portNumbers(CONFIG.port, CONFIG.port + 100)
  });
  CONFIG.port = port;

  app.listen(port, async () => {
    const ip = await internalIpV4();
    const lanUrl = `http://${ip ?? 'localhost'}:${port}`;
    CONFIG.lanUrl = lanUrl;
    console.log(`\n🚀 Money Dashboard running at ${lanUrl}\n`);
    console.log('📊 红利罗盘 + 债市晴雨表 + 基金温度计\n');

    // 启动定时任务
    startScheduler();
  });
}

start();
