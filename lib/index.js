/**
 * 在 DSH 后台跑一个 HTTP 接口。
 * 当收到“删除会话”的请求时，按照严格的顺序：
 * -> 停止任务
 * -> 清理工作区记录
 * -> 删除缓存
 * -> 物理删除磁盘文件
 * -> 通知前端刷新
 */

/**
 * 基础配置
 * 引入 Node.js 的文件系统模块，用来物理删除文件夹 (rm) 和读取目录 (readdir)。
 */
import { rm, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// 插件名称
export const name = 'dsh-session-delete';

// 声明依赖的服务（增加 storageDomain）
export const inject = ['sessionPersistence', 'workspaceRegistry', 'sessions', 'webServer', 'storageDomain'];

// 供前端调用的 API 路径
const API_PATH = '/plugins/dsh-session-delete/delete';

/**
 * 处理删除请求的核心逻辑
 */
async function SessionDelete(ctx, sessionId) {
    // 查一下会话存不存在
    const liveSession = ctx.sessions.get(sessionId);
    let meta;

    if (liveSession) {
        meta = liveSession.header;
        // 如果任务在运行，先尝试停止
        try {
            await ctx.parallel('workspace/session-stop', { sessionId });
            // 等待 500 毫秒，确保数据写盘完毕
            await new Promise(r => setTimeout(r, 500));
        } catch (e) {
            console.warn('[会话删除] 停止任务失败:', e);
        }
    } else {
        // 如果是在硬盘里的冷会话
        const stat = await ctx.sessionPersistence.stat(sessionId);
        if (!stat) throw new Error('会话不存在');
        meta = stat.header;
    }

    // 从工作区记录中移除（取消归档、取消置顶、从列表移除）
    try {
        await ctx.workspaceRegistry.unarchiveSession(sessionId);
        await ctx.workspaceRegistry.unpinSession(sessionId);
        for (const ws of ctx.workspaceRegistry.list()) {
            if (ws.sessionIds.includes(sessionId)) {
                await ws.detachSession(sessionId);
            }
        }
    } catch (e) {
        console.warn('[会话删除] 清理工作区记录失败:', e);
    }

    // 删除投影缓存
    try {
        const projcache = ctx.storageDomain?.get('session_projcache');
        if (projcache) {
            await projcache.table('sessions').delete(sessionId);
        }
    } catch (e) {
        console.warn('[会话删除] 清理投影缓存失败:', e);
    }

    // 物理删除硬盘上的日志文件
    try {
        const located = ctx.sessionPersistence.locate(meta);
        if (located && located.path) {
            // 删除该日志所在的父文件夹
            await rm(dirname(located.path), { recursive: true, force: true });
        }
    } catch (e) {
        console.error('[会话删除] 删除物理文件失败:', e);
        throw new Error('文件删除失败，可能被占用');
    }

    // 通知前端界面刷新
    ctx.emit('api-session/removed', sessionId);
}

/**
 * 插件初始化入口
 */
export function apply(ctx) {
    // 注册一个后端 HTTP 接口供前端调用
    ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: API_PATH,
        handler: async (req, res) => {
            if (req.method !== 'POST') {
                res.writeHead(405); res.end(); return;
            }

            try {
                // 读取前端发来的 JSON 数据
                const buffers = [];
                for await (const chunk of req) buffers.push(chunk);
                const body = JSON.parse(Buffer.concat(buffers).toString());

                if (!body.sessionId) {
                    res.writeHead(400); res.end(JSON.stringify({ ok: false, msg: '缺少ID' })); return;
                }

                // 执行删除
                await SessionDelete(ctx, body.sessionId);

                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (err) {
                res.writeHead(500, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ ok: false, msg: err.message }));
            }
        }
    }), 'dsh-session-delete-route');
}