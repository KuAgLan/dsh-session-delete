# dsh-session-delete

在会话行「...」菜单加一项 **删除会话**：点击 → 弹窗确认 → 永久删除这个会话。

⚠️ 删除不可恢复，不进回收站。

## 安装

要求：DeepSeek Harness `>= 0.2.1-rc.3`，Node.js `>= 20`。

1）克隆仓库，并把它链接进 profile 的 `node_modules`（Windows 用目录联接，不需要管理员）：

```powershell
git clone <repo-url> dsh-session-delete
cd dsh-session-delete

New-Item -ItemType Junction `
  -Path   "$HOME\.dsh\profiles\desktop\node_modules\dsh-session-delete" `
  -Target (Get-Location)
```

2）在 profile 的 `cordis.patch.yml` 末尾追加挂载行：

```yaml
- insert:
    - id: dsh-session-delete
      name: 'dsh-session-delete'
```

3）重启 DeepSeek Harness（或让 profile 补丁重新 apply）。

卸载：删掉 `node_modules/dsh-session-delete` 联接与上面那段 insert 即可。

## 使用

1. 刷新页面。
2. 在左栏会话行悬停 → `...` → **删除会话**。
3. 弹窗里核对标题与序列号，点「确定删除」。
4. 该会话的日志目录、投影缓存与工作区记账会被一起删除，侧栏那一行随即消失。

失败时弹窗会显示原因（例如「会话不存在」「文件删除失败，可能被占用」）。
