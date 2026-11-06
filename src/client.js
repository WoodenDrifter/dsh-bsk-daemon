// dsh-bsk-daemon：浏览器侧。
//
// 这个包自己不开面板、不占侧栏。它只把一张卡片注册进「拓展」容器
// （dsh-extension 提供的 extensionHub 服务），由容器统一负责折叠、拖拽、开关、搜索。
//
// Bundle 格式（client-modules 协议）：经典脚本，通过 window.__ModuleLoader__.load
// 注册工厂；工厂拿到 require，返回 { apply, inject }。不用 JSX。
window.__ModuleLoader__.load({
  // id 必须与 package.json 的 name 完全一致，短名会被判成「加载了但没注册」
  id: 'dsh-bsk-daemon',
  factory: (require) => {
    const React = require('react')
    const { createElement: h, useCallback, useEffect, useRef, useState } = React

    const NS = 'dsh-bsk-daemon'
    const PKG = 'dsh-bsk-daemon'
    const API = '/__dsh-ext/bsk'

    // dsh 真实主题 token（--dsw-alias-* 家族）；每个都带兜底，浅色主题也能跟随
    const C = {
      text: 'var(--dsw-alias-label-primary, #e6e6e8)',
      text2: 'var(--dsw-alias-label-secondary, #b0b3b8)',
      text3: 'var(--dsw-alias-label-tertiary, #76797e)',
      line: 'var(--dsw-alias-border-l1, rgba(128,128,128,.28))',
      line2: 'var(--dsw-alias-border-l2, rgba(128,128,128,.18))',
      card: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,.10))',
      hover: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.16))',
      ok: 'var(--dsw-alias-state-success-primary, #2ec866)',
      warn: 'var(--dsw-alias-state-warn-primary, #f0931b)',
      err: 'var(--dsw-alias-state-error-primary, #ff5c5c)',
      primary: 'var(--dsw-alias-button-primary-fill, #1f1f1f)',
      primaryFg: 'var(--dsw-alias-label-primary-foreground, #fff)',
      primaryHover: 'var(--dsw-alias-button-primary-hover, #333)',
      mono: 'var(--dsw-font-markdown-code-font-family, ui-monospace, Consolas, monospace)',
    }

    function IconBsk(props) {
      const size = (props && props.size) || 18
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': 'true' },
        h('rect', { x: 2.5, y: 2.5, width: 9, height: 9, rx: 2.2, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('rect', { x: 8.5, y: 8.5, width: 9, height: 9, rx: 2.2, stroke: 'currentColor', strokeWidth: 1.4, opacity: 0.65 }),
        h('path', { d: 'M12.8 3.6l3.4 3.4M16.2 3.6l-3.4 3.4', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' })
      )
    }

    function Dot({ color }) {
      return h('span', {
        style: {
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: 999,
          background: color,
          boxShadow: `0 0 6px ${color}`,
          flex: 'none',
        },
      })
    }

    function Pill({ children, tone }) {
      const color = tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : tone === 'err' ? C.err : C.text3
      return h(
        'span',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            lineHeight: '16px',
            padding: '1px 8px',
            borderRadius: 999,
            color,
            border: `1px solid ${color}44`,
            background: `${color}14`,
            whiteSpace: 'nowrap',
          },
        },
        h(Dot, { color }),
        children
      )
    }

    function Btn({ children, onClick, disabled, primary }) {
      const [hover, setHover] = useState(false)
      return h(
        'button',
        {
          type: 'button',
          disabled,
          onClick,
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          style: {
            height: 28,
            padding: '0 12px',
            fontSize: 12.5,
            borderRadius: 7,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            color: primary ? C.primaryFg : C.text,
            background: primary ? (hover ? C.primaryHover : C.primary) : hover ? C.hover : 'transparent',
            border: primary ? '1px solid transparent' : `1px solid ${C.line}`,
            transition: 'background .12s',
            fontWeight: primary ? 500 : 400,
          },
        },
        children
      )
    }

    // ---------------- 状态缓存：Badge 与 Body 共用一份，避免各发一次请求 ----------------
    const store = { st: null, err: null }
    const listeners = new Set()
    let inflight = null

    function emit() {
      for (const fn of listeners) {
        try {
          fn()
        } catch {}
      }
    }

    async function fetchStatus() {
      if (inflight) return inflight
      inflight = (async () => {
        try {
          const res = await fetch(`${API}/status`, {
            credentials: 'same-origin',
            headers: { 'x-dsh-ext': 'bsk' },
          })
          const j = await res.json()
          if (!j || !j.ok) throw new Error((j && j.error) || `状态读取失败（HTTP ${res.status}）`)
          store.st = j.data
          store.err = null
        } catch (e) {
          store.err = e.message || String(e)
        } finally {
          inflight = null
          emit()
        }
      })()
      return inflight
    }

    function subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }

    function useStatus(intervalMs) {
      const alive = useRef(true)
      const [, force] = useState(0)
      useEffect(() => {
        alive.current = true
        const un = subscribe(() => alive.current && force((n) => n + 1))
        fetchStatus()
        const t = intervalMs ? setInterval(fetchStatus, intervalMs) : null
        return () => {
          alive.current = false
          un()
          if (t) clearInterval(t)
        }
      }, [intervalMs])
      return { st: store.st, err: store.err }
    }

    function badgeOf(st) {
      if (!st) return { text: '读取中…', tone: '' }
      if (!st.installed) return { text: '未安装 bsk', tone: '' }
      if (!st.running) return { text: 'daemon 未运行', tone: '' }
      if (st.connected) return { text: '已连接浏览器', tone: 'ok' }
      return { text: 'daemon 运行中 · 未连接', tone: 'warn' }
    }

    // 卡片头右侧的状态胶囊。只在被挂载时轮询（折叠时容器不渲染它）。
    function Badge() {
      const { st } = useStatus(8000)
      const b = badgeOf(st)
      return h(Pill, { tone: b.tone }, b.text)
    }

    // 卡片展开体。容器只在展开时挂载它，所以轮询天然跟着折叠停。
    function Body() {
      const { st, err } = useStatus(5000)
      const [busy, setBusy] = useState(false)
      const [steps, setSteps] = useState([])
      const [result, setResult] = useState(null)
      const alive = useRef(true)

      useEffect(
        () => () => {
          alive.current = false
        },
        []
      )

      const doRestart = useCallback(async () => {
        setBusy(true)
        setResult(null)
        setSteps([{ t: 0, text: '正在重启 bsk…' }])
        try {
          const res = await fetch(`${API}/restart`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'x-dsh-ext': 'bsk' },
          })
          const j = await res.json()
          if (alive.current) {
            setResult({ ok: Boolean(j && j.ok), message: (j && j.data && j.data.message) || (j && j.error) || '' })
            setSteps((j && j.data && j.data.steps) || [])
            if (j && j.data && j.data.status) store.st = j.data.status
          }
        } catch (e) {
          if (alive.current) setResult({ ok: false, message: e.message })
        } finally {
          if (alive.current) setBusy(false)
          fetchStatus()
        }
      }, [])

      return h(
        'div',
        null,
        err ? h('div', { style: { fontSize: 12, color: C.err, marginBottom: 8 } }, err) : null,
        h(
          'div',
          { style: { fontSize: 12.5, color: C.text2, lineHeight: 1.75, marginBottom: 10 } },
          st ? st.evidence : '读取中…'
        ),
        st && st.protocolWarning
          ? h(
              'div',
              {
                style: {
                  fontSize: 12,
                  color: C.warn,
                  border: `1px solid ${C.warn}44`,
                  background: `${C.warn}14`,
                  borderRadius: 7,
                  padding: '7px 10px',
                  marginBottom: 10,
                  lineHeight: 1.6,
                },
              },
              st.protocolWarning
            )
          : null,
        h(
          'div',
          { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h(Btn, { primary: true, onClick: doRestart, disabled: busy }, busy ? '正在重启…' : '重启 bsk'),
          h(Btn, { onClick: fetchStatus, disabled: busy }, '刷新状态'),
          result
            ? h('span', { style: { fontSize: 12, color: result.ok ? C.ok : C.err } }, (result.ok ? '✓ ' : '✗ ') + result.message)
            : null
        ),
        steps.length
          ? h(
              'div',
              {
                style: {
                  marginTop: 10,
                  fontFamily: C.mono,
                  fontSize: 11.5,
                  lineHeight: 1.7,
                  color: C.text3,
                  background: C.card,
                  border: `1px solid ${C.line2}`,
                  borderRadius: 7,
                  padding: '8px 10px',
                  maxHeight: 150,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                },
              },
              steps.map((s, i) => h('div', { key: i }, `${String(s.t).padStart(5, ' ')}ms  ${s.text}`))
            )
          : null,
        h(
          'div',
          { style: { fontSize: 11, color: C.text3, marginTop: 10, lineHeight: 1.7 } },
          `重启会先 daemon stop，再以 --foreground 重新拉起，等 ${52800} 端口就绪。`,
          '这一步只影响浏览器扩展，不会中断当前对话。'
        )
      )
    }

    const ITEM = {
      id: 'bsk',
      name: { zh: '浏览器技能（bsk）', en: 'Browser Skill (bsk)' },
      desc: {
        zh: '本机 bsk daemon 的启停、版本与浏览器连接状态，可一键重启',
        en: 'Start, stop and inspect the local bsk daemon; shows version and browser connection',
      },
      group: { id: 'browser', name: { zh: '浏览器与自动化', en: 'Browser & automation' } },
      order: 10,
      pluginName: PKG,
      icon: IconBsk,
      Badge,
      Body,
    }

    function apply(ctx) {
      let timer = null
      let disposeItem = null
      let tries = 0

      const attach = () => {
        const hub = (ctx.get && ctx.get('extensionHub')) || window.__DSH_EXTENSION_HUB__
        if (hub && typeof hub.register === 'function') {
          disposeItem = hub.register(ITEM)
          return
        }
        // 「拓展」可能比本包晚一步 apply，等一会儿；超过 15s 就放弃（本包没有独立入口）
        if (++tries > 75) {
          console.warn(`[${NS}] 没有找到 extensionHub，卡片未注册`)
          return
        }
        timer = setTimeout(attach, 200)
      }

      ctx.effect(() => {
        attach()
        return () => {
          if (timer) clearTimeout(timer)
          if (typeof disposeItem === 'function') disposeItem()
          disposeItem = null
        }
      }, `${NS}: register card`)
    }

    return { apply, inject: [] }
  },
})
