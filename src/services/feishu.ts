import * as https from 'https';
import { CONFIG } from '../config';
import { generateReportImage, ReportData } from './reportImage';
import { generateDashboardImage, DashboardData } from './dashboardImage';

let tokenCache: { token: string; expireAt: number } | null = null;

async function httpRequest(url: string, body: string, headers: Record<string, string>, method: string = 'POST'): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method,
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

// Backward compat alias
const httpPost = httpRequest;

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

async function sendMessage(chatId: string, msgType: string, content: string): Promise<string | null> {
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
    return null;
  } else {
    console.log(`[Feishu] Message sent to ${chatId}`);
    return result.data?.message_id || null;
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

async function urgentApp(messageId: string): Promise<void> {
  const openId = CONFIG.feishu.urgentOpenId;
  if (!openId) return;
  const token = await getTenantAccessToken();
  const resp = await httpRequest(
    `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/urgent_app?user_id_type=open_id`,
    JSON.stringify({ user_id_list: [openId] }),
    {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    'PATCH',
  );
  const result = JSON.parse(resp.data);
  if (result.code !== 0) {
    console.error(`[Feishu] Urgent failed: code=${result.code} msg=${result.msg}`);
  } else {
    console.log(`[Feishu] Urgent sent for message ${messageId}`);
  }
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
  returnDiff: { date: string; diff: number; status: string; prevStatus: string; divReturn: number; allReturn: number };
  bondWeather: { date: string; weather: string; value: number; change: number; temperature: number; status: string; prevStatus: string };
  thermometer: { date: string; temperature: number; status: string; prevStatus: string; pe: number; bondYield: number; erp: number };
  diffHistory?: { date: string; diff: number }[];
  bondHistory?: { date: string; value: number }[];
  erpHistory?: { date: string; erp: number; close: number }[];
}): Promise<void> {
  const { chatId } = CONFIG.feishu;
  if (!chatId) {
    console.warn('[Feishu] FEISHU_CHAT_ID not configured, skipping notification');
    return;
  }

  const { returnDiff, bondWeather, thermometer } = data;

  // 1) 生成简报图（3个gauge卡片）嵌入卡片消息
  let reportImageKey: string | null = null;
  try {
    const reportData: ReportData = {
      date: returnDiff.date,
      returnDiff: { diff: returnDiff.diff, status: returnDiff.status },
      bondWeather: { weather: bondWeather.weather, value: bondWeather.value, change: bondWeather.change, temperature: bondWeather.temperature, status: bondWeather.status },
      thermometer: { temperature: thermometer.temperature, status: thermometer.status, pe: thermometer.pe, bondYield: thermometer.bondYield, erp: thermometer.erp },
    };
    const buf = await generateReportImage(reportData);
    reportImageKey = await uploadImage(buf);
  } catch (err) {
    console.error('[Feishu] Report image failed:', err instanceof Error ? err.message : err);
  }

  // Card message with report image
  const elements: any[] = [];
  if (reportImageKey) {
    elements.push({ tag: 'img', img_key: reportImageKey, alt: { tag: 'plain_text', content: '市场速报' } });
  } else {
    elements.push({ tag: 'markdown', content: [
      `**01 红利罗盘 · ${returnDiff.status}**`,
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

  await sendMessage(chatId, 'interactive', JSON.stringify({
    header: { title: { tag: 'plain_text', content: `📊 市场速报 ${returnDiff.date}` }, template: 'blue' },
    elements,
  }));

  // 2) 生成完整Dashboard图（带走势图）单独发送
  try {
    const dashData: DashboardData = {
      date: returnDiff.date,
      returnDiff: { diff: returnDiff.diff, status: returnDiff.status, divReturn: returnDiff.divReturn, allReturn: returnDiff.allReturn },
      bondWeather: { weather: bondWeather.weather, value: bondWeather.value, change: bondWeather.change, temperature: bondWeather.temperature, status: bondWeather.status },
      thermometer: { temperature: thermometer.temperature, status: thermometer.status, pe: thermometer.pe, bondYield: thermometer.bondYield, erp: thermometer.erp },
      diffHistory: data.diffHistory,
      bondHistory: data.bondHistory,
      erpHistory: data.erpHistory,
    };
    const dashBuf = await generateDashboardImage(dashData);
    const dashImageKey = await uploadImage(dashBuf);
    await sendImageMessage(chatId, dashImageKey);
  } catch (err) {
    console.error('[Feishu] Dashboard image failed:', err instanceof Error ? err.message : err);
  }

  // 3) 极端信号预警：前一交易日在正常区，当日进入极端区时发送加急消息
  const alerts: string[] = [];

  const isNormal = (s: string) => s.includes('适中') || s.includes('正常');
  const isCold = (s: string) => s.includes('过冷') || s.includes('低估') || s.includes('低温');
  const isHot = (s: string) => s.includes('过热') || s.includes('高估') || s.includes('高温');

  if (isNormal(returnDiff.prevStatus) && isHot(returnDiff.status)) alerts.push(`🔥 红利进入过热区（收益差 ${returnDiff.diff > 0 ? '+' : ''}${returnDiff.diff}%），宜逐步减仓`);
  if (isNormal(returnDiff.prevStatus) && isCold(returnDiff.status)) alerts.push(`❄️ 红利进入过冷区（收益差 ${returnDiff.diff > 0 ? '+' : ''}${returnDiff.diff}%），宜逢低加仓`);
  if (isNormal(bondWeather.prevStatus) && isHot(bondWeather.status)) alerts.push(`🔥 债市进入高估区（温度 ${bondWeather.temperature}℃），建议适时止盈`);
  if (isNormal(bondWeather.prevStatus) && isCold(bondWeather.status)) alerts.push(`❄️ 债市进入低估区（温度 ${bondWeather.temperature}℃），适合买入`);
  if (isNormal(thermometer.prevStatus) && isHot(thermometer.status)) alerts.push(`🔥 基金温度进入高温区（${thermometer.temperature}℃），暂停定投，及时止盈`);
  if (isNormal(thermometer.prevStatus) && isCold(thermometer.status)) alerts.push(`❄️ 基金温度进入低温区（${thermometer.temperature}℃），加倍定投`);

  if (alerts.length > 0) {
    const alertContent = alerts.join('\n\n');
    const alertMsgId = await sendMessage(chatId, 'interactive', JSON.stringify({
      header: { title: { tag: 'plain_text', content: '⚠️ 市场极端信号' }, template: 'red' },
      elements: [{ tag: 'markdown', content: alertContent }],
    }));
    if (alertMsgId) {
      await urgentApp(alertMsgId);
    }
  }
}
