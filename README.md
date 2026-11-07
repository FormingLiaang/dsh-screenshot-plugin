> ⚠️ **本仓库不是原创作品**
>
> 本仓库是 [deepseekbluefish/dsh-screenshot-plugin](https://github.com/deepseekbluefish/dsh-screenshot-plugin) 的修改版。
> 原项目采用 MIT 协议，**版权归原作者所有**。
> 本仓库仅在其基础上做功能增强与 Bug 修复，不声称任何原创性。
>
> **主要改动：**
> 1. 截图后直接作为图片附件放入输入框（不再是纯文字标记）
> 2. 新增：点击截图键后自动最小化窗口，框选结束自动还原
> 3. 修复：保存目录不存在、中文文件名乱码、当前会话识别失败
>
> 本修改由 FormingLiaang 提出需求、在DeepSeek-V4.1-Flash协助下完成。
>
> 以下为原作者原文，**〔改动〕标记处为本 fork 的修改**。

---

DeepSeek Harness 界面内的**微信式一键框选截屏**插件：对话输入框左侧多一个 ✂ 按钮，点一下全屏变暗、拖动框选区域即可截取。

- 松手后**选区保留**：可拖动移动、拖四角/四边手柄缩放，双击或按 Enter 确认截取
- PNG 自动编号（`截屏N_HHmm.png`）存入指定目录
- 〔改动〕截图直接作为**图片附件**放入输入框，与粘贴一张图相同，可直接配文字发送〔/改动〕
- 纯 ASCII 标记，无编码坑
- 〔改动〕**新增**：点击截图键后自动最小化前台窗口，框选结束或取消后自动还原〔/改动〕

## 多语言简介 / Intro

- **简体中文**：微信式一键框选截屏插件：拖动框选、8 个手柄微调，Enter 确认截取、Esc 取消；PNG 自动编号保存，〔改动〕截图直接作为图片附件放入输入框〔/改动〕。已在 DeepSeek Harness Desktop 实测。
- **繁體中文**：微信式一鍵框選截圖外掛：拖曳框選、8 個控點微調，Enter 確認截取、Esc 取消；PNG 自動編號儲存，〔改動〕截圖直接作為圖片附件放入輸入框〔/改動〕。已在 DeepSeek Harness Desktop 實測。
- **English**: WeChat-style one-click screenshot plugin: drag to select, fine-tune with 8 resize handles; press Enter to capture 〔change: the screenshot is attached to the composer as an image instead of a text marker〕, Esc to cancel. PNGs are auto-numbered. Tested on DeepSeek Harness Desktop.
- **Русский**: Плагин скриншотов в стиле WeChat: выделите область перетаскиванием, подправьте с помощью 8 маркеров; Enter — снять скриншот 〔изменение: снимок вставляется в поле ввода как изображение〕, Esc — отмена. PNG сохраняются с автонумерацией. Проверено на DeepSeek Harness Desktop.
- **Français** : Capture d'écran façon WeChat : sélectionnez à la souris, ajustez avec 8 poignées ; Entrée pour capturer 〔modification : l'image est jointe au champ de saisie au lieu d'un marqueur texte〕, Échap pour annuler. PNG numérotés automatiquement. Testé sur DeepSeek Harness Desktop.
- **Italiano**: Plugin di screenshot stile WeChat: seleziona trascinando, regola con 8 maniglie; Invio per catturare 〔modifica: l'immagine viene allegata al campo di input invece di un marcatore testuale〕, Esc per annullare. PNG con numerazione automatica. Testato su DeepSeek Harness Desktop.
- **日本語**: WeChat 風のワンクリックスクリーンショットプラグイン：ドラッグで範囲選択、8 つのハンドルで微調整。Enter で撮影（〔変更：撮影した画像が入力欄に添付される〕）、Esc でキャンセル。PNG は自動連番で保存。DeepSeek Harness Desktop で動作確認済み。
- **한국어**: WeChat 스타일 원클릭 스크린샷 플러그인: 드래그로 영역 선택, 8개 핸들로 미세 조정. Enter로 캡처(〔변경: 캡처한 이미지가 입력창에 첨부됨〕), Esc로 취소. PNG 자동 번호 저장. DeepSeek Harness Desktop에서 테스트 완료.

## 安装

〔改动〕安装本 fork：〔/改动〕

```sh
〔改动〕dsh plugin --profile web add github:FormingLiaang/dsh-screenshot-plugin〔/改动〕
