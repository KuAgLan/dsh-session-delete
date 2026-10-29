/**
 * dsh-session-delete 客户端代码
 * 负责在侧边栏菜单注入「删除会话」按钮，并处理确认弹窗。
 */
window.__ModuleLoader__.load({
    // 必须与 package.json 里的 name 保持一致
    id: 'dsh-session-delete',
    factory: (require) => {
        const module = { exports: {} };
        const exports = module.exports;

        // 通过 require 加载宿主提供的外部依赖
        const React = require('react');
        const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
        const { MenuItemButton, Modal, Button, IconTrashOutlineRegular } = primitives;
        const { createSnapshotStore } = require('@deepseek-ai/dsh-client-store');

        // 与后端 index.js 里的 API_PATH 保持一致
        const API_PATH = '/plugins/dsh-session-delete/delete';

        /**
         * 动态注入 CSS 样式
         * 使用 DSH 宿主提供的语义变量（如 --dsw-alias-state-error-primary），
         * 确保按钮和弹窗的颜色能够自动适配日间/夜间主题。
         */
        const STYLE_ID = 'dsh-session-delete-style';
        function ensureStyle() {
            if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
                .dsh-delete-danger-btn:not(:disabled) {
                    color: var(--dsw-alias-state-error-primary);
                    border-color: var(--dsw-alias-state-error-primary);
                }
                .dsh-delete-danger-btn:not(:disabled):hover {
                    background: var(--dsw-alias-state-error-primary);
                    color: var(--dsw-alias-label-on-primary, #fff);
                }
                .dsh-delete-meta {
                    margin-top: 12px;
                    font-size: 12px;
                    line-height: 18px;
                    color: var(--dsw-alias-label-tertiary);
                    word-break: break-all;
                }
            `;
            document.head.appendChild(style);
        }

        /**
         * 确认删除弹窗组件
         * 注意：弹窗注册在全局浮层(shell.overlay)中，而不是菜单项里。
         * 这样点击菜单收起后，弹窗依然能稳定显示。
         */
        function DeleteConfirmDialog({ useDeleteRequest, dismissDeleteRequest }) {
            // 获取全局状态里的待确认请求
            const request = useDeleteRequest((pending) => pending);
            const [deleting, setDeleting] = React.useState(false);
            const [error, setError] = React.useState(null);

            React.useEffect(() => { ensureStyle(); }, []);

            const sessionId = request === null ? null : request.sessionId;

            // 每次打开新的弹窗，重置状态
            React.useEffect(() => {
                setDeleting(false);
                setError(null);
            }, [sessionId]);

            if (request === null) return null;

            // 弹窗标题和确认逻辑
            const title = request.displayTitle || sessionId;
            const close = () => {
                if (deleting) return;
                dismissDeleteRequest();
            };

            const confirm = () => {
                if (deleting) return;
                setDeleting(true);
                setError(null);

                // 发送 POST 请求到我们自己的后端 index.js
                fetch(API_PATH, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ sessionId }),
                })
                    .then(async (response) => {
                        const data = await response.json().catch(() => ({}));
                        if (!response.ok || data.ok !== true) {
                            throw new Error(data.msg || '删除失败');
                        }
                        // 成功后关闭弹窗（后端的 ctx.emit 会自动让列表刷新）
                        dismissDeleteRequest();
                    })
                    .catch((err) => {
                        setError(err.message);
                        setDeleting(false);
                    });
            };

            // 使用原生 React.createElement 构建 Modal（避免使用 JSX 需要编译）
            return React.createElement(Modal, {
                open: true,
                onClose: close,
                title: '删除会话',
                footer: React.createElement(React.Fragment, null,
                    React.createElement(Button, {
                        variant: 'outline',
                        disabled: deleting,
                        onClick: close,
                        children: '取消',
                    }),
                    React.createElement(Button, {
                        variant: 'outline',
                        className: 'dsh-delete-danger-btn',
                        disabled: deleting,
                        onClick: confirm,
                        children: deleting ? '正在删除...' : '确定删除',
                    })
                ),
                children: [
                    React.createElement('div', { key: 'msg' },
                        '此操作不可恢复，该会话的所有对话记录将被永久删除。'
                    ),
                    React.createElement('div', { key: 'meta-title', className: 'dsh-delete-meta' },
                        '会话：', title
                    ),
                    React.createElement('div', { key: 'meta-id', className: 'dsh-delete-meta' },
                        '序列号：', sessionId
                    ),
                    error !== null ? React.createElement('div', {
                        key: 'error',
                        className: 'dsh-delete-meta',
                        style: { color: 'var(--dsw-alias-state-error-primary)' }
                    }, '删除失败：', error) : null
                ]
            });
        }

        /**
         * 侧边栏菜单项组件
         */
        function DeleteMenuItem({ sessionId, displayTitle, useMenuOpenState, deleteRequest }) {
            const [, setMenuOpen] = useMenuOpenState ? useMenuOpenState() : [null, () => {}];

            const onSelect = () => {
                setMenuOpen(false); // 点击后立刻收起菜单
                // 触发全局状态，通知弹窗显示
                deleteRequest.set({ sessionId, displayTitle });
            };

            return React.createElement(MenuItemButton, {
                icon: React.createElement(IconTrashOutlineRegular, { size: 14 }),
                danger: true, // 原生危险红色样式
                onSelect,
                children: '删除会话',
            });
        }

        /**
         * 客户端插件入口
         */
        function apply(ctx) {
            try {
                const slots = ctx.get ? ctx.get('slots') : undefined;
                if (!slots) return;

                // 全局状态存储，用于菜单项和弹窗通信
                const deleteRequest = createSnapshotStore(null);

                // 注入到左侧会话菜单（order 999 ）
                slots.inject('sidebar.workspaces.session.menu.item', function* () {
                    yield slots.register({
                        name: 'sidebar.workspaces.session.menu.item',
                        id: 'delete-session',
                        order: 999,
                        inject: () => ({ deleteRequest }),
                    }, DeleteMenuItem);
                });

                // 注入到全局浮层
                slots.inject('shell.overlay', function* () {
                    yield slots.register({
                        name: 'shell.overlay',
                        id: 'delete-session-dialog',
                        inject: () => ({
                            hooks: { deleteRequest },
                            dismissDeleteRequest: () => deleteRequest.set(null),
                        }),
                    }, DeleteConfirmDialog);
                });

                console.info('[dsh-session-delete] 客户端加载成功');
            } catch (error) {
                console.error('[dsh-session-delete] 客户端加载失败', error);
            }
        }

        // 导出给 DSH 框架
        exports.apply = apply;
        exports.inject = ['slots'];
        return module.exports;
    }
});
