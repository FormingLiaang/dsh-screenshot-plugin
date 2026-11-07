/**
 * dsh-screenshot-plugin — host 半段（改造版）
 *
 * 注册两条路由：
 *   POST /api/screenshot/capture  拉起 PowerShell 框选覆盖层，PNG 存入指定目录，
 *                                 返回 { ok, file, path, marker }
 *   GET  /api/screenshot/file     按文件名回传 PNG 字节，供客户端构造成 File
 *                                 直接放进输入框附件栏（不再只留一行文字标记）
 *
 * Esc 取消返回 { ok: false, cancelled: true }。
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CAPTURE_PS1 = join(here, 'capture.ps1');
const DEFAULT_FOLDER = join(homedir(), 'Pictures', 'DSH-Screenshots');

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** 拉起框选截屏脚本并收集其 JSON 输出。 */
function runCapture(folder) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', CAPTURE_PS1, '-Folder', String(folder)],
      { windowsHide: true },
    );
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(out.trim()));
        } catch {
          reject(new Error(`截屏脚本输出解析失败: ${out.slice(0, 200)}`));
        }
      } else {
        reject(new Error(`截屏失败 (exit ${code}): ${(err || out).slice(0, 300)}`));
      }
    });
  });
}

/** 只允许回传保存目录下的 png 文件名，挡掉路径穿越。 */
function isSafeShotName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 200 &&
    !name.includes('/') && !name.includes('\\') && name !== '.' && name !== '..' &&
    /\.png$/i.test(name);
}

export function apply(ctx, config) {
  const folder = (config && config.folder) || DEFAULT_FOLDER;

  ctx.inject(['webServer'], (scope) => {
    scope.effect(() => {
      const disposeCapture = scope.webServer.register({
        kind: 'exact',
        path: '/api/screenshot/capture',
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'method not allowed' });
            return;
          }
          try {
            const result = await runCapture(folder);
            // PowerShell 的 stdout 走系统代码页，中文文件名可能变成乱码。
            // 脚本额外返回纯 ASCII 的 n/stamp，这里用它们重建真实文件名。
            if (result && result.ok && result.n !== undefined && result.stamp !== undefined) {
              const rebuilt = `\u622A\u5C4F${result.n}_${result.stamp}.png`;
              result.file = rebuilt;
              result.path = join(folder, rebuilt);
            }
            // 直接把图片字节随响应带回，客户端无需再发一次 GET，
            // 避免第二条请求在网关/路由层被挡成 404。
            if (result && result.ok && result.file) {
              try {
                const bytes = await readFile(join(folder, result.file));
                result.imageBase64 = bytes.toString('base64');
                result.imageMediaType = 'image/png';
              } catch (readErr) {
                result.imageError = String(readErr && readErr.message ? readErr.message : readErr);
              }
            }
            sendJson(res, 200, result);
          } catch (err) {
            sendJson(res, 500, { ok: false, error: String(err && err.message ? err.message : err) });
          }
        },
      });

      const disposeFile = scope.webServer.register({
        kind: 'exact',
        path: '/api/screenshot/file',
        handler: async (req, res) => {
          if (req.method !== 'GET') {
            sendJson(res, 405, { ok: false, error: 'method not allowed' });
            return;
          }
          try {
            const url = new URL(req.url || '/', 'http://127.0.0.1');
            const name = url.searchParams.get('name');
            if (!isSafeShotName(name)) {
              sendJson(res, 400, { ok: false, error: 'bad name' });
              return;
            }
            const data = await readFile(join(folder, name));
            res.writeHead(200, {
              'Content-Type': 'image/png',
              'Content-Length': data.length,
              'Cache-Control': 'no-store',
            });
            res.end(data);
          } catch (err) {
            sendJson(res, 404, { ok: false, error: String(err && err.message ? err.message : err) });
          }
        },
      });

      return () => {
        disposeCapture();
        disposeFile();
      };
    }, 'dsh-screenshot: http routes');
  });
}

export const inject = [];
export const name = 'screenshot';
