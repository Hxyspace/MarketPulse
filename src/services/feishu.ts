import * as https from 'https';
import { CONFIG } from '../config';
import { generateReportImage, ReportData } from './reportImage';

let tokenCache: { token: string; expireAt: number } | null = null;

async function httpPost(url: string, body: string, headers: Record<string, string>): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode || 0, data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getTenantAccessToken(): Promise<string> {
  const { appId, appSecret } = CONFIG.feishu;
  if (!appId || !appSecret) throw new Error('FEISHU_APP_ID or FEISHU_APP_SECRET not configured');

  // 缓存有效期内直接返回（提前5分钟刷新）
  if (tokenCache && Date.now() < tokenCache.expireAt - 5 * 60 * 1000) {
    return tokenCache.token;
  }

  const resp = await httpPost(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    JSON.stringify({ app_id: appId, app_secret: appSecret }),
    { 'Content-Type': 'application/json; charset=utf-8' },
  );

  const result = JSON.parse(resp.data);
  if (result.code !== 0) throw new Error(`Get tenant_access_token failed: ${result.msg}`);

  tokenCache = {
    token: result.tenant_access_token,
    expireAt: Date.now() + result.expire * 1000,
  };
  console.log('[Feishu] tenant_access_token refreshed');
  return tokenCache.token;
}

async function sendMessage(chatId: string, msgType: string, content: string): Promise<void> {
  const token = await getTenantAccessToken();
  const body = JSON.stringify({
    receive_id: chatId,
    msg_type: msgType,
    content,
  });

  const resp = await httpPost(
    'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
    body,
    {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
  );

  const result = JSON.parse(resp.data);
  if (result.code !== 0) {
    console.error(`[Feishu] Send message failed: code=${result.code} msg=${result.msg}`);
  } else {
    console.log(`[Feishu] Message sent to ${chatId}`);
  }
}

/**
 * 上传图片到飞书，返回 image_key
 */
async function uploadImage(imageBuffer: Buffer): Promise<string> {
  const token = await getTenantAccessToken();
  const boundary = '----FormBoundary' + Date.now().toString(36);

  const parts: Buffer[] = [];
  // image_type field
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image_type"\r\n\r\nmessage\r\n`));
  // image file
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="report.png"\r\nContent-Type: image/png\r\n\r\n`));
  parts.push(imageBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'open.feishu.cn',
      path: '/open-apis/im/v1/images',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.code !== 0) {
            reject(new Error(`Upload image failed: code=${result.code} msg=${result.msg}`));
          } else {
            console.log(`[Feishu] Image uploaded: ${result.data.image_key}`);
            resolve(result.data.image_key);
          }
        } catch {
          reject(new Error('Failed to parse upload response'));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 发送图片消息
 */
async function sendImageMessage(chatId: string, imageKey: string): Promise<void> {
  await sendMessage(chatId, 'image', JSON.stringify({ image_key: imageKey }));
}

export async function sendFeishuMessage(title: string, content: string): Promise<void> {
  const { chatId } = CONFIG.feishu;
  if (!chatId) {
    console.warn('[Feishu] FEISHU_CHAT_ID not configured, skipping notification');
    return;
  }

  const card = {
    header: {
      title: { tag: 'plain_text', content: title },
      template: 'blue',
    },
    elements: [{ tag: 'markdown', content }],
  };

  await sendMessage(chatId, 'interactive', JSON.stringify(card));
}

export async function sendDailyReport(data: {
  returnDiff: { date: string; diff: number; compass: string };
  bondWeather: { date: string; weather: string; value: number; change: number; temperature: number };
  thermometer: { date: string; temperature: number; status: string; pe: number; bondYield: number; erp: number };
}): Promise<void> {
  const { chatId } = CONFIG.feishu;
  if (!chatId) {
    console.warn('[Feishu] FEISHU_CHAT_ID not configured, skipping notification');
    return;
  }

  const { returnDiff, bondWeather, thermometer } = data;

  // 生成报告图并上传
  let imageKey: string | null = null;
  try {
    const reportData: ReportData = {
      date: returnDiff.date,
      returnDiff: { diff: returnDiff.diff, compass: returnDiff.compass },
      bondWeather: { weather: bondWeather.weather, value: bondWeather.value, change: bondWeather.change, temperature: bondWeather.temperature },
      thermometer: { temperature: thermometer.temperature, status: thermometer.status, pe: thermometer.pe, bondYield: thermometer.bondYield, erp: thermometer.erp },
    };
    const imageBuf = await generateReportImage(reportData);
    imageKey = await uploadImage(imageBuf);
  } catch (err) {
    console.error('[Feishu] Report image generation failed:', err instanceof Error ? err.message : err);
  }

  // 构建卡片消息，用图片替代数据文本
  const elements: any[] = [];

  if (imageKey) {
    elements.push({
      tag: 'img',
      img_key: imageKey,
      alt: { tag: 'plain_text', content: '市场速报' },
    });
  } else {
    // fallback: 纯文本
    elements.push({ tag: 'markdown', content: [
      `**01 红利罗盘 · ${returnDiff.compass}**`,
      `收益差：${returnDiff.diff > 0 ? '+' : ''}${returnDiff.diff}%`,
      '',
      `**02 债市晴雨表 · ${bondWeather.weather}**`,
      `净价：${bondWeather.value}（${bondWeather.change > 0 ? '+' : ''}${bondWeather.change}）温度：${bondWeather.temperature}℃`,
      '',
      `**03 基金温度计 · ${thermometer.temperature}℃**`,
      `${thermometer.status}`,
      `PE ${thermometer.pe} | 国债 ${thermometer.bondYield}% | ERP ${thermometer.erp}%`,
    ].join('\n') });
  }

  elements.push({ tag: 'hr' });
  elements.push({ tag: 'markdown', content: `📈 [Dashboard](http://localhost:${CONFIG.port})` });

  const card = {
    header: {
      title: { tag: 'plain_text', content: `📊 市场速报 ${returnDiff.date}` },
      template: 'blue',
    },
    elements,
  };

  await sendMessage(chatId, 'interactive', JSON.stringify(card));
}
