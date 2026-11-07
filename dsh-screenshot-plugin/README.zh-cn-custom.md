# dsh-screenshot-plugin（改造版）

DeepSeek Harness 输入框旁的 **✂ 一键框选截屏** 插件。

本版在原版 [deepseekbluefish/dsh-screenshot-plugin](https://github.com/deepseekbluefish/dsh-screenshot-plugin) 基础上做了改造：**截图后直接把图片放进输入框的附件栏**（等同于粘贴一张图），而不是只留一行 `[Shot N HH:mm]` 文字标记。

## 功能

- 点击输入框左侧 **✂**，拖动框选屏幕区域，Enter 或双击确认，Esc 取消
- 截图自动编号保存为 `截屏N_HHmm.png`（保存目录可配置）
- **截图直接作为图片附件出现在输入框**，按 Enter 即可和文字一起发送
- 可选：点击 ✂ 后自动最小化 DSH 窗口，方便截取后面的内容（框选结束自动还原）
- 若附件插入失败，会自动退回旧行为：把 `[Shot N HH:mm]` 标记写进输入框

## 安装

把本目录放到 profile 的 `node_modules` 下后重启 DSH：

```
~/.dsh/profiles/<profile>/node_modules/dsh-screenshot-plugin/
```

并确认 profile 的 `package.json` 里 `dsh.profile.bundles` 包含 `dsh-screenshot-plugin`。

也可以直接安装本地目录：

```sh
dsh plugin --profile web add /path/to/dsh-screenshot-plugin
```

**装完必须重启 DSH。**

## 配置

截图保存目录默认 `~/Pictures/DSH-Screenshots`，在 profile 的 `cordis.patch.yml` 里覆盖：

```yaml
- id: screenshot
  config:
    folder: 'D:\MyScreenshots'
```

## 相对原版的改动

1. **修复：保存目录不存在时截屏失败**
   原版从不创建保存目录，新机器上截图会报「截屏失败」。
2. **修复：中文文件名乱码**
   PowerShell 的 stdout 走系统代码页，宿主按 UTF-8 解码导致 `截屏N_HHmm.png` 变乱码、读取报 ENOENT。
   现由脚本额外返回纯 ASCII 的 `n` / `stamp`，宿主据此重建文件名。
3. **修复：截图直接进输入框**
   原版只写文字标记，其他会话的 AI 不知道去哪个目录找图。
   本版通过 DSH 的 `conversation.createDrafts` + 输入框 `addAttachments` 把图片放进附件栏；
   图片字节随截屏响应内嵌返回，不额外发请求。
4. **新增：自动最小化**
   框选层显示后最小化前台窗口，框选结束或 Esc 后自动还原；用 `WM_SYSCOMMAND` 实现，兼容 `ShowWindow` 被拒的环境。

## 已知限制

- 仅 Windows（依赖 Windows PowerShell 与 System.Drawing）
- 自动最小化在框选层出现后约 0.6 秒生效
- 依赖 DSH 客户端的 `conversation` 服务接口；DSH 大版本升级后可能需要适配

## 许可

MIT，与原版一致。改造部分同样以 MIT 发布。
