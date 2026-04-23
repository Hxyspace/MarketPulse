import * as https from 'https';
import { CONFIG } from '../config';

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
  const { returnDiff, bondWeather, thermometer } = data;

  const content = [
    `**📊 每日市场速报 ${returnDiff.date}**`,
    '',
    '---',
    '',
    `**01 红利罗盘 · ${returnDiff.compass}**`,
    `红利低波相对全A 40日收益差：**${returnDiff.diff > 0 ? '+' : ''}${returnDiff.diff}%**`,
    '',
    `**02 债市晴雨表 · ${bondWeather.weather}**`,
    `中债新综合净价：${bondWeather.value}（${bondWeather.change > 0 ? '+' : ''}${bondWeather.change}）`,
    `债市温度：**${bondWeather.temperature}℃**`,
    '',
    `**03 基金温度计 · ${thermometer.temperature}℃**`,
    `${thermometer.status}`,
    `沪深300 PE：${thermometer.pe} | 10年国债：${thermometer.bondYield}% | 股债利差：${thermometer.erp}%`,
    '',
    '---',
    `📈 Dashboard: http://localhost:${CONFIG.port}`,
  ].join('\n');

  await sendFeishuMessage(`市场速报 ${returnDiff.date}`, content);
}
