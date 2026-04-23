import 'dotenv/config';
import express from 'express';
import path from 'path';
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

app.listen(CONFIG.port, () => {
  console.log(`\n🚀 Money Dashboard running at http://localhost:${CONFIG.port}\n`);
  console.log('📊 红利罗盘 + 债市晴雨表 + 基金温度计\n');

  // 启动定时任务
  startScheduler();
});
