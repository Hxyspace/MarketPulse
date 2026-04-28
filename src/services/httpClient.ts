import * as https from 'https';
import { URL } from 'url';

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
  /**
   * 是否校验 TLS 证书，默认 true。
   * 个别国内数据源（如中债）证书链不完整时可显式关闭。
   */
  rejectUnauthorized?: boolean;
}

export interface HttpRawResponse {
  status: number;
  data: string;
}

const DEFAULT_TIMEOUT = 30000;

/**
 * 统一 HTTPS 请求封装。
 * 返回原始响应字符串与状态码，由调用方决定如何解析。
 */
export function httpsRequest(url: string, opts: HttpRequestOptions = {}): Promise<HttpRawResponse> {
  const { method = 'GET', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT, rejectUnauthorized } = opts;

  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const finalHeaders: Record<string, string | number> = { ...headers };
    if (body !== undefined && finalHeaders['Content-Length'] === undefined) {
      finalHeaders['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request({
      hostname: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 443,
      path: u.pathname + u.search,
      method,
      headers: finalHeaders,
      ...(rejectUnauthorized === false ? { rejectUnauthorized: false } : {}),
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode || 0, data }));
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms: ${u.hostname}${u.pathname}`));
    });

    if (body !== undefined) req.write(body);
    req.end();
  });
}

/**
 * 在 httpsRequest 之上做 JSON 解析。
 * 解析失败或状态码非 2xx 时抛出包含上下文的错误。
 */
export async function httpsJson<T = unknown>(url: string, opts: HttpRequestOptions = {}): Promise<T> {
  const resp = await httpsRequest(url, opts);
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`HTTP ${resp.status} from ${url}: ${resp.data.substring(0, 200)}`);
  }
  try {
    return JSON.parse(resp.data) as T;
  } catch {
    throw new Error(`Failed to parse JSON from ${url}: ${resp.data.substring(0, 200)}`);
  }
}
