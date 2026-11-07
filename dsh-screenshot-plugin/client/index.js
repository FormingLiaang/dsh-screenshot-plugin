/**
 * dsh-screenshot-plugin — 客户端半段（改造版）
 *
 * 在对话输入框左侧注入截屏按钮：
 *   点击 → POST /api/screenshot/capture（宿主拉起全屏框选，窗口自动最小化）
 *        → 成功后取回 PNG 字节，构造成 File
 *        → 通过 conversation.createDrafts + inputActions.addAttachments
 *          直接把图片放进输入框的附件栏（等同于粘贴一张图）
 *        → 任一步失败则退回到旧行为：把 [Shot N HH:mm] 标记写进输入框
 *
 * 兜底顺序：fileUpload 附件 → 文本标记。所有步骤带 toast，便于现场诊断。
 */
window.__ModuleLoader__.load({
  id: 'dsh-screenshot-plugin',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    function safeRequire(name) {
      try {
        return require(name);
      } catch (err) {
        console.warn('[dsh-screenshot]', 'require failed:', name, err);
        return null;
      }
    }

    // ---- 屏幕内 toast（诊断用，几秒后自动淡出）----
    let toastEl = null;
    function showToast(text, kind) {
      try {
        if (!toastEl) {
          toastEl = document.createElement('div');
          toastEl.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);' +
            'padding:10px 16px;border-radius:12px;font-size:13px;line-height:20px;z-index:2147483000;' +
            'max-width:80vw;box-shadow:0 8px 30px rgba(0,0,0,.25);transition:opacity .15s ease;' +
            'pointer-events:none;white-space:pre-wrap;word-break:break-word;';
          document.body.appendChild(toastEl);
        }
        const colors = {
          info: ['rgba(42,42,42,.96)', '#e8e8e8'],
          error: ['#3a1d1d', '#ffb4b4'],
          ok: ['#12311f', '#9fe7b5'],
        }[kind] || ['rgba(42,42,42,.96)', '#e8e8e8'];
        toastEl.style.background = colors[0];
        toastEl.style.color = colors[1];
        toastEl.textContent = text;
        toastEl.style.opacity = '1';
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => { toastEl.style.opacity = '0'; }, kind === 'error' ? 9000 : 4000);
      } catch (e) { /* toast is diagnostic only */ }
    }

    /**
     * 当前会话 id。DSH 的 sessions.list 快照里没有 current 字段，
     * 真实来源是 uiSession.current.value.key（主视图绑定的会话）。
     */
    function currentSessionId(ctx) {
      // 1) uiSession 主绑定
      try {
        const cur = ctx.uiSession && ctx.uiSession.current && ctx.uiSession.current.value;
        if (cur && typeof cur.key === 'string' && cur.key !== '') return cur.key;
      } catch (err) {
        console.warn('[dsh-screenshot]', 'uiSession.current failed:', err);
      }
      // 2) 会话列表里被主视图保留的那一行
      try {
        const state = ctx.sessions.list.getSnapshot();
        const rows = Object.values(state.byId || {});
        const main = rows.find((r) => ((r.retainedBy && r.retainedBy.mainView) || 0) > 0);
        if (main) return main.id || main.sessionId;
        if (rows.length === 1) return rows[0].id || rows[0].sessionId;
      } catch (err) {
        console.warn('[dsh-screenshot]', 'session list fallback failed:', err);
      }
      return undefined;
    }

    function resolveInputActions(ctx, props) {
      const tries = [];
      if (props && props.inputActions && typeof props.inputActions.setDraft === 'function') {
        tries.push('props.inputActions');
        return { actions: props.inputActions, via: 'props.inputActions', tries };
      }
      const sessions = ctx.sessions;
      const currentId = currentSessionId(ctx);
      if (currentId && sessions && typeof sessions.provideInfo === 'function') {
        try {
          const info = sessions.provideInfo(currentId);
          const actions = info && info.props && info.props.inputActions;
          tries.push('provideInfo=' + (info ? 'bundle' : 'undefined'));
          if (actions && typeof actions.setDraft === 'function') {
            return { actions, via: 'sessions.provideInfo', tries };
          }
          tries.push('provideInfo.props.inputActions missing, keys=' + (info && info.props ? Object.keys(info.props).join(',') : 'none'));
        } catch (err) {
          tries.push('provideInfo threw: ' + (err && err.message));
          console.warn('[dsh-screenshot]', 'provideInfo failed:', err);
        }
      } else {
        tries.push('no provideInfo api');
      }
      return { actions: null, via: null, tries };
    }

    /** 拿到 conversation 服务（可能有也可能没有），失败返回 null。 */
    function resolveConversation(ctx) {
      const candidates = [];
      try {
        if (typeof ctx.get === 'function') candidates.push(ctx.get('conversation'));
      } catch (err) {
        console.warn('[dsh-screenshot]', 'ctx.get(conversation) failed:', err);
      }
      try {
        candidates.push(ctx.conversation);
      } catch (err) {
        console.warn('[dsh-screenshot]', 'ctx.conversation unavailable:', err);
      }
      for (const conv of candidates) {
        if (conv && typeof conv.createDrafts === 'function') return conv;
      }
      return null;
    }

    /** 普通会话才允许上传图片；子代理续写走内联字节。 */
    function sessionAcceptsImageUpload(ctx, sessionId) {
      try {
        const binding = ctx.sessions && ctx.sessions.binding ? ctx.sessions.binding(sessionId) : null;
        const snap = binding && binding.session && binding.session.getSnapshot ? binding.session.getSnapshot() : null;
        if (snap) return snap.subagent === null;
      } catch (err) {
        console.warn('[dsh-screenshot]', 'subagent probe failed:', err);
      }
      return true;
    }

    /**
     * 把截图变成输入框里的真实图片附件。
     * @returns {Promise<{ok: boolean, reason?: string}>}
     */
    async function attachShotAsImage(ctx, props, shot) {
      const sessionId = currentSessionId(ctx);
      if (!sessionId) return { ok: false, reason: '没有当前会话' };

      const conv = resolveConversation(ctx);
      if (!conv) return { ok: false, reason: 'conversation 服务不可用' };

      const actions = resolveInputActions(ctx, props).actions;
      if (!actions || typeof actions.addAttachments !== 'function') {
        return { ok: false, reason: '当前输入框不支持添加附件' };
      }

      let blob;
      try {
        if (typeof shot.imageBase64 === 'string' && shot.imageBase64 !== '') {
          // 首选：截图响应里已带上字节，省一次请求
          const bin = atob(shot.imageBase64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
          blob = new Blob([bytes], { type: shot.imageMediaType || 'image/png' });
        } else {
          const res = await fetch('/api/screenshot/file?name=' + encodeURIComponent(shot.file), { cache: 'no-store' });
          if (!res.ok) {
            let detail = '';
            try { detail = (await res.text()).slice(0, 120); } catch (e) { /* ignore */ }
            return { ok: false, reason: '读取截图失败 HTTP ' + res.status + (detail ? ' ' + detail : '') };
          }
          blob = await res.blob();
        }
      } catch (err) {
        return { ok: false, reason: '读取截图出错: ' + (err && err.message ? err.message : err) };
      }

      let file;
      try {
        file = new File([blob], shot.file, { type: 'image/png' });
      } catch (err) {
        return { ok: false, reason: '构造文件失败: ' + (err && err.message ? err.message : err) };
      }

      let drafts;
      try {
        // 普通会话允许立即上传图片；子代理续写不允许，改用内联字节
        drafts = conv.createDrafts(sessionId, [file], sessionAcceptsImageUpload(ctx, sessionId));
      } catch (err) {
        return { ok: false, reason: '注册附件失败: ' + (err && err.message ? err.message : err) };
      }
      if (!drafts || drafts.length === 0) return { ok: false, reason: '附件注册返回空' };

      try {
        actions.addAttachments(drafts.map((d) => d.id));
      } catch (err) {
        try { conv.releaseDraftAttachments && conv.releaseDraftAttachments(drafts); } catch (e) { /* ignore */ }
        return { ok: false, reason: '加入附件栏失败: ' + (err && err.message ? err.message : err) };
      }

      return { ok: true };
    }

    function apply(ctx) {
      try {
        const react = safeRequire('react');
        if (!react) return;
        const h = react.createElement;

        function ScreenshotButton(props) {
          const [busy, setBusy] = react.useState(false);
          const onClick = async () => {
            if (busy) return;
            setBusy(true);
            try {
              const res = await fetch('/api/screenshot/capture', { method: 'POST' });
              const data = await res.json();
              if (!data.ok) {
                if (data.cancelled) { /* silent cancel */ }
                else {
                  console.error('[dsh-screenshot]', data.error || ('HTTP ' + res.status));
                  showToast('截屏失败：' + (data.error || ('HTTP ' + res.status)), 'error');
                }
                return;
              }

              // 首选：直接放进输入框的附件栏
              const attached = await attachShotAsImage(ctx, props, data);
              if (attached.ok) {
                showToast('截图已加入输入框：' + data.file, 'ok');
                return;
              }

              // 兜底：写入文字标记（旧行为）
              const resolved = resolveInputActions(ctx, props);
              if (resolved.actions) {
                resolved.actions.setDraft(data.marker);
                showToast('未能插入图片（' + attached.reason + '），已填入标记：' + data.marker, 'info');
                return;
              }

              const currentId = currentSessionId(ctx);
              const binding = currentId && ctx.sessions.binding ? ctx.sessions.binding(currentId) : null;
              if (binding && binding.session) {
                await binding.session.prompt([{ type: 'text', text: data.marker }], 'queue');
                showToast('未能插入图片（' + attached.reason + '），已作为消息入队：' + data.marker, 'info');
                return;
              }

              const detail = resolved.tries.join(' | ') || 'unknown';
              console.error('[dsh-screenshot]', 'no draft path; tries:', detail);
              showToast('截图已保存但无法放入输入框：' + data.file + '\n（' + attached.reason + '）', 'error');
            } catch (err) {
              console.error('[dsh-screenshot]', err);
              showToast('截屏处理出错：' + (err && err.message ? err.message : err), 'error');
            } finally {
              setBusy(false);
            }
          };
          return h('button', {
            type: 'button',
            onClick,
            disabled: busy,
            title: busy ? '截屏中…（拖动框选区域）' : '一键框选截屏：截图直接加入输入框',
            'aria-label': '框选截屏',
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              padding: '0',
              border: 'none',
              borderRadius: '8px',
              background: 'transparent',
              color: 'var(--dsw-alias-label-tertiary, #9a9a9a)',
              cursor: busy ? 'default' : 'pointer',
              fontSize: '16px',
              lineHeight: '1',
              fontFamily: 'inherit',
              opacity: busy ? 0.5 : 1,
            },
            onMouseEnter: (e) => {
              if (!busy) {
                e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, #2a2a2a)';
                e.currentTarget.style.color = 'var(--dsw-alias-label-primary, #e8e8e8)';
              }
            },
            onMouseLeave: (e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--dsw-alias-label-tertiary, #9a9a9a)';
            },
          }, busy ? '⏳' : '✂');
        }

        ctx.slots.inject('conversation.input.left', function* () {
          yield ctx.slots.register(
            { name: 'conversation.input.left', id: 'dsh-screenshot', key: 'dsh-screenshot' },
            ScreenshotButton,
          );
        });
      } catch (err) {
        console.error('[dsh-screenshot]', 'apply failed:', err);
      }
    }

    exports.apply = apply;
    exports.inject = ['slots', 'sessions'];
    return module.exports;
  },
});
