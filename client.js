/**
 * Client half of the English Cards bundle.
 *
 * Two surfaces share one data source — the `englishLearningCards` session
 * projection registered by the host half:
 *
 * - the ambient deck above the composer, bound to the current session;
 * - the English Cards panel (sidebar entry + `main` page), which reads every
 *   session's projection values from the client session list.
 */

window.__ModuleLoader__.load({
  id: 'dsh-english-cards',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'englishLearning'
    const PROJECTION_KEY = 'englishLearningCards'
    const PANEL_ID = 'english-cards'
    const EMPTY_CARDS = []
    /** Stand-in when a host does not hand the session store to a dock slot. */
    const useNoSession = () => undefined
    const EMPTY_LIST = { ids: [], byId: {}, projectionsBySession: {}, phase: 'pending' }

    const en = {
      aria: 'English cards',
      title: 'English Cards',
      show: 'Show',
      hide: 'Hide',
      correctionsInMessage: 'corrections in this message',
      thisTurn: 'This turn',
      waiting: 'Listening for English',
      emptyTitle: 'No English notes yet',
      emptyBody: 'Write in English — when a reply adds an English note, it lands here as a study card.',
      corrected: 'Corrected',
      rule: 'Rule',
      example: 'Example',
      original: 'Original',
      turnPrefix: 'Turn',
      turnSuffix: '',
      openTurn: 'Jump to',
      openLibrary: 'All cards',
      panel: 'English cards',
      panelTitle: 'English cards',
      panelIntro: 'Every English note detected in your conversations, collected in one place.',
      searchPlaceholder: 'Search patterns, corrections, rules, examples',
      searchLabel: 'Search English cards',
      cardsLabel: 'cards',
      cardOne: 'card',
      sessionsLabel: 'sessions',
      sessionOne: 'session',
      openSession: 'Open',
      loading: 'Loading sessions…',
      pageEmptyTitle: 'No cards yet',
      pageEmptyBody: 'Write in English in any conversation. When a reply includes an English note, it lands here as a study card.',
      backToConversation: 'Back to conversation',
      noResults: 'No cards match your search.',
      clearSearch: 'Clear search',
      syncToAoi: 'Sync to Aoi',
      syncWaiting: 'Waiting for authorization…',
      syncAuthLink: 'Open authorization page',
      syncExpired: 'Disconnected — turn on again',
      syncError: 'Error',
      review: 'Review',
    }

    const zh = {
      aria: '英语卡片',
      title: '英语卡片',
      show: '展开',
      hide: '收起',
      correctionsInMessage: '处更正（本条消息）',
      thisTurn: '本轮',
      waiting: '等待英文笔记',
      emptyTitle: '还没有英文笔记',
      emptyBody: '用英文写下想法；回复里出现英文笔记时，它会作为学习卡收集在这里。',
      corrected: '更正',
      rule: '规则',
      example: '例句',
      original: '原句',
      turnPrefix: '第',
      turnSuffix: '轮',
      openTurn: '定位到',
      openLibrary: '全部卡片',
      panel: '英语卡片',
      panelTitle: '英语卡片',
      panelIntro: '所有对话中检测到的英文笔记，集中在这里。',
      searchPlaceholder: '搜索语法、更正、规则、例句',
      searchLabel: '搜索英语卡片',
      cardsLabel: '张卡片',
      cardOne: '张卡片',
      sessionsLabel: '个会话',
      sessionOne: '个会话',
      openSession: '打开',
      loading: '正在加载会话…',
      pageEmptyTitle: '还没有卡片',
      pageEmptyBody: '在任意对话里用英文写下想法；回复中出现英文笔记时，它会作为学习卡收集到这里。',
      backToConversation: '回到对话',
      noResults: '没有匹配的卡片。',
      clearSearch: '清除搜索',
      syncToAoi: '同步到小葵',
      syncWaiting: '等待授权…',
      syncAuthLink: '打开授权页面',
      syncExpired: '已断开，请重新打开',
      syncError: '错误',
      review: '复习',
    }

    const CSS = `
      .elc,.elc-page{--elc-new:#2f8f6f;--elc-good:color-mix(in srgb,#0f8a5f 78%,var(--dsw-alias-label-primary));--elc-bad:color-mix(in srgb,#c0392b 82%,var(--dsw-alias-label-primary));--elc-serif:"Iowan Old Style","Palatino Linotype","Songti SC","Noto Serif CJK SC",ui-serif,Georgia,serif}
      .elc-dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance,0px) - var(--dsh-composer-side-clearance,0px) - var(--dsh-composer-dock-inset,0px) - var(--dsh-composer-dock-inset,0px) - var(--dsh-composer-dock-inset,0px) - var(--dsh-composer-dock-inset,0px));margin:0 auto}
      .elc-stack{position:relative;isolation:isolate;box-sizing:border-box;width:100%;max-width:calc(var(--dsh-composer-card-max-width,748px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));margin:0 auto;padding-bottom:8px}
      .elc-layer{position:absolute;z-index:0;left:14px;right:14px;bottom:6px;height:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);opacity:.9;pointer-events:none;transition:opacity .22s ease,transform .22s ease}
      .elc-layer--2{left:24px;right:24px;bottom:3px;opacity:.6}
      .elc-stack[data-open="true"] .elc-layer{opacity:0;transform:translateY(-3px)}
      .elc-card{position:relative;z-index:1;box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);overflow:hidden;font-size:13px;line-height:20px;container-type:inline-size}
      .elc-head{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;padding:6px 10px 6px 12px;margin:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
      .elc-head:hover{background:var(--dsw-alias-bg-layer-2)}
      .elc-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
      .elc-badge{flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:7px;background:var(--dsw-alias-bg-layer-2);background:color-mix(in oklab,var(--dsw-alias-brand-primary) 12%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-brand-primary)}
      .elc-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;letter-spacing:-.01em}
      .elc-count{flex:none;box-sizing:border-box;min-width:19px;height:19px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);background:color-mix(in oklab,var(--dsw-alias-brand-primary) 14%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-brand-primary);font-size:11px;font-weight:600;line-height:19px;text-align:center;font-variant-numeric:tabular-nums;animation:elc-pop .22s cubic-bezier(.22,1,.36,1)}
      .elc-hint{margin-left:auto;flex:none;color:var(--dsw-alias-label-secondary);font-size:12px;letter-spacing:.01em;white-space:nowrap}
      .elc-chevron{flex:none;display:inline-flex;color:var(--dsw-alias-label-secondary);transition:transform .22s cubic-bezier(.22,1,.36,1)}
      .elc-chevron[data-open="true"]{transform:rotate(180deg)}
      .elc-expand{display:grid;grid-template-rows:0fr;transition:grid-template-rows .24s cubic-bezier(.22,1,.36,1)}
      .elc-expand[data-open="true"]{grid-template-rows:1fr}
      .elc-expand-inner{min-height:0;overflow:hidden}
      .elc-preview{display:flex;align-items:baseline;gap:8px;min-width:0;padding:0 12px 9px 44px;animation:elc-fade .22s cubic-bezier(.22,1,.36,1)}
      .elc-pattern{flex:none;max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-brand-primary);font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase}
      .elc-sep{flex:none;width:3px;height:3px;border-radius:50%;background:var(--dsw-alias-border-l2);transform:translateY(-1px)}
      .elc-preview-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-family:var(--elc-serif);font-size:13px;line-height:18px}
      .elc-preview--list{flex-direction:column;align-items:stretch;gap:1px;padding-top:1px}
      .elc-preview-row{display:flex;align-items:baseline;gap:8px;min-width:0;margin:0;padding:2px 4px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;animation:elc-fade .22s cubic-bezier(.22,1,.36,1)}
      .elc-preview-row:hover{background:var(--dsw-alias-bg-layer-2)}
      .elc-preview-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
      .elc-preview-index{flex:none;width:14px;color:var(--dsw-alias-label-secondary);font-size:9.5px;font-weight:600;line-height:18px;letter-spacing:.06em;font-variant-numeric:tabular-nums}
      .elc-preview-more{margin-top:3px;color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:16px;letter-spacing:.02em}
      .elc-preview--list .elc-pattern{max-width:36%}
      .elc-preview--list .elc-preview-text{font-size:12.5px;line-height:17px}
      .elc-preview[data-current="true"] .elc-hl{background:color-mix(in oklab,var(--elc-new) 18%,transparent);box-shadow:inset 0 -1px 0 color-mix(in oklab,var(--elc-new) 45%,transparent)}
      .elc-note[data-current="true"]{background:linear-gradient(90deg,color-mix(in oklab,var(--elc-new) 7%,transparent),transparent 46%)}
      .elc-note[data-current="true"] .elc-hl{background:color-mix(in oklab,var(--elc-new) 18%,transparent);box-shadow:inset 0 -1px 0 color-mix(in oklab,var(--elc-new) 45%,transparent)}
      .elc-new{flex:none;align-self:center;padding:1px 6px;border-radius:999px;background:color-mix(in oklab,var(--elc-new) 14%,transparent);color:var(--elc-new);font-size:9.5px;font-weight:600;letter-spacing:.04em;white-space:nowrap}
      .elc-body{max-height:300px;overflow-y:auto;border-top:1px solid var(--dsw-alias-border-l1);scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}
      .elc-expand[data-open="true"] .elc-body{animation:elc-fade .2s cubic-bezier(.22,1,.36,1)}
      .elc-note{padding:10px 14px 12px}
      .elc-note + .elc-note{border-top:1px solid var(--dsw-alias-border-l1)}
      .elc-expand[data-open="true"] .elc-note{animation:elc-note-in .26s cubic-bezier(.22,1,.36,1) both}
      .elc-note-head{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}
      .elc-index{flex:none;color:var(--dsw-alias-label-secondary);font-size:10px;font-weight:600;line-height:18px;letter-spacing:.08em;font-variant-numeric:tabular-nums}
      .elc-note-title{margin:0;min-width:0;color:var(--dsw-alias-label-primary);font-family:var(--elc-serif);font-size:14px;font-weight:600;line-height:20px}
      .elc-title-alt{margin-left:2px;color:var(--dsw-alias-label-secondary);font-family:var(--elc-serif);font-size:11.5px;font-weight:400;letter-spacing:0}
      .elc-hl{border-radius:4px;background:color-mix(in srgb,var(--elc-good) 13%,transparent);color:var(--elc-good);font-weight:600;padding:0 2px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
      .elc-del{border-radius:4px;background:color-mix(in srgb,var(--elc-bad) 9%,transparent);color:var(--elc-bad);text-decoration:line-through;text-decoration-thickness:1px;text-decoration-color:color-mix(in srgb,var(--elc-bad) 62%,transparent);padding:0 2px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
      .elc-group-corrected{margin:0 0 10px;color:var(--dsw-alias-label-primary);font-family:var(--elc-serif);font-size:15px;line-height:22px;text-wrap:pretty}
      .elc-group-list{display:flex;flex-direction:column;margin:0;padding:0;list-style:none}
      .elc-group-item{padding:9px 0 0;border-top:1px solid var(--dsw-alias-border-l1)}
      .elc-group-item:first-child{padding-top:0;border-top:0}
      .elc-group-item-title{margin:0 0 1px;min-width:0;color:var(--dsw-alias-label-primary);font-family:var(--elc-serif);font-size:13.5px;font-weight:600;line-height:20px}
      .elc-group-item .elc-rule{margin:0}
      .elc-group-item .elc-example{margin:2px 0 0}
      .elc-source-note .elc-group-corrected{margin-bottom:8px}
      .elc-entry .elc-group-corrected{font-size:16px;line-height:23px;margin-bottom:12px}
      .elc-entry .elc-group-item-title{font-size:15px;line-height:22px}
      .elc-entry .elc-group-item{padding-top:10px}
      .elc-entry .elc-rule,.elc-entry .elc-example{font-size:13px;line-height:20px}
      .elc-locate{display:inline-flex;align-items:center;gap:4px;flex:none;align-self:center;margin-left:auto;padding:3px 6px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:16px;white-space:nowrap;cursor:pointer}
      .elc-locate:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
      .elc-locate:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .elc-locate-arrow{display:inline-flex}
      .elc-rule{color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:18px;text-wrap:pretty}
      .elc-example{color:var(--dsw-alias-label-secondary);font-family:var(--elc-serif);font-size:12.5px;line-height:18px;text-wrap:pretty}
      .elc-empty{display:flex;align-items:flex-start;gap:10px;padding:10px 14px 12px}
      .elc-empty-art{flex:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);background:color-mix(in oklab,var(--dsw-alias-brand-primary) 10%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-brand-primary)}
      .elc-empty-copy{min-width:0}
      .elc-empty-title{display:block;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600}
      .elc-empty-body{display:block;margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;text-wrap:pretty}
      .elc-library{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:8px 14px;border:0;border-top:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;text-align:left}
      .elc-library:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
      .elc-library:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
      .elc-library-arrow{flex:none;display:inline-flex}
      .elc-page{box-sizing:border-box;height:100%;display:flex;flex-direction:column;align-items:center;gap:24px;padding:0 clamp(24px,4vw,48px) 48px;overflow:auto;color:var(--dsw-alias-label-primary)}
      .elc-page>*{width:100%;max-width:960px}
      .elc-page-head{box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;padding-top:28px}
      [data-platform=darwin] .elc-page-head{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
      .elc-page-heading{min-width:0}
      .elc-page-title{margin:0;font-size:20px;font-weight:500;line-height:28px}
      .elc-page-intro{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;text-wrap:pretty}
      .elc-page-intro strong{font-weight:600;color:var(--dsw-alias-label-primary)}
      .elc-page-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
      .elc-search{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;flex:0 1 360px;width:100%;max-width:360px;height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}
      .elc-search:focus-within{border-color:var(--dsw-alias-brand-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary)}
      .elc-search-glyph{display:inline-flex;flex:none}
      .elc-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:0}
      .elc-search input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.85}
      .elc-stats{flex:none;margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap;font-variant-numeric:tabular-nums}
      .elc-stats strong{font-weight:600;color:var(--dsw-alias-label-primary)}
      .elc-page-body{display:flex;flex-direction:column;gap:32px;padding-bottom:16px}
      .elc-group{display:flex;flex-direction:column}
      .elc-group-head{display:flex;align-items:baseline;gap:10px;padding:0 0 10px}
      .elc-group-title{margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:600;line-height:24px}
      .elc-group-count{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px;font-variant-numeric:tabular-nums}
      .elc-source-count{flex:none;color:var(--dsw-alias-label-secondary);font-size:10px;font-weight:600;line-height:20px;letter-spacing:.04em;white-space:nowrap}
      .elc-open{display:inline-flex;align-items:center;gap:4px;flex:none;margin-left:auto;padding:4px 6px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;line-height:18px;cursor:pointer}
      .elc-open:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
      .elc-open:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .elc-open-arrow{display:inline-flex}
      .elc-entry{padding:14px 0 16px;border-top:1px solid var(--dsw-alias-border-l1)}
      .elc-entry .elc-note-title{font-size:15px;line-height:22px}
      .elc-entry .elc-rule,.elc-entry .elc-example{font-size:13px;line-height:20px}
      .elc-page-status{margin:0;padding:16px 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
      .elc-page-empty{display:flex;flex-direction:column;align-items:flex-start;gap:10px;max-width:560px;padding:40px 0 24px}
      .elc-page-empty-art{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);background:color-mix(in oklab,var(--dsw-alias-brand-primary) 10%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-brand-primary)}
      .elc-page-empty-title{margin:0;font-size:16px;font-weight:600;line-height:24px}
      .elc-page-empty-body{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;text-wrap:pretty}
      .elc-action{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
      .elc-action:hover{background:var(--dsw-alias-bg-layer-2)}
      .elc-action:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .elc-page-actions{display:flex;align-items:center;justify-content:flex-end;gap:16px;flex:none;flex-wrap:wrap;padding-bottom:2px;-webkit-app-region:no-drag;app-region:no-drag}
      .elc-page-actions *{-webkit-app-region:no-drag;app-region:no-drag}
      .elc-sync-control{display:flex;align-items:center;gap:8px;min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
      .elc-sync-control[data-on="true"]{color:var(--dsw-alias-label-primary)}
      .elc-sync-label{white-space:nowrap;font-weight:500}
      .elc-sync-switch{position:relative;flex:none;width:34px;height:18px;margin:0;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-border-l2);cursor:pointer;transition:background .18s ease}
      .elc-sync-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}
      .elc-sync-switch::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.18);transition:transform .18s ease}
      .elc-sync-switch[aria-checked="true"]::after{transform:translateX(16px)}
      .elc-sync-switch:disabled{opacity:.5;cursor:default}
      .elc-sync-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .elc-sync-note{max-width:170px;color:var(--elc-bad);font-size:11px;line-height:15px;text-align:right}
      .elc-sync-note a{color:inherit;text-decoration:underline}
      .elc-review-link{display:inline-flex;align-items:center;height:22px;color:var(--dsw-alias-brand-primary);font-size:12px;font-weight:500;text-decoration:none;white-space:nowrap}
      .elc-review-link:hover{text-decoration:underline}
      @media (max-width:720px){.elc-page-actions{width:100%;justify-content:space-between}}
      @container (max-width:430px){.elc-hint{display:none}.elc-body{max-height:220px}}
      @media (max-width:640px){.elc-page-toolbar{width:100%}.elc-search{flex:1 1 auto;max-width:none}.elc-stats{margin-left:0}}
      @media (prefers-reduced-motion:reduce){.elc-layer,.elc-chevron,.elc-expand{transition:none}.elc-count,.elc-preview,.elc-expand[data-open="true"] .elc-body,.elc-expand[data-open="true"] .elc-note{animation:none}}
      @keyframes elc-pop{from{transform:scale(.72);opacity:.4}to{transform:scale(1);opacity:1}}
      @keyframes elc-fade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
      @keyframes elc-note-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
    `

    function BookGlyph({ size = 16 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': true,
          focusable: 'false',
        },
        h('path', {
          d: 'M12 6.2C10.4 4.9 8.1 4.2 5.2 4.2v13.6c2.9 0 5.2.7 6.8 2 1.6-1.3 3.9-2 6.8-2V4.2c-2.9 0-5.2.7-6.8 2Z',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M12 6.2v13.6',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
      )
    }

    /**
     * Sidebar entry mark: a speech bubble holding a capital A, so the rail reads
     * "English, in conversation" rather than the generic open book that matched
     * the study-deck badge.
     */
    function SpeechCardGlyph({ size = 20 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': true,
          focusable: 'false',
        },
        h('path', {
          d: 'M7 4.8h10a2.4 2.4 0 0 1 2.4 2.4v6.4a2.4 2.4 0 0 1-2.4 2.4h-5.4l-3.2 2.7v-2.7H7a2.4 2.4 0 0 1-2.4-2.4V7.2A2.4 2.4 0 0 1 7 4.8Z',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M9.7 13 12 7.4l2.3 5.6',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M10.5 11.2h3',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
        }),
      )
    }

    function Chevron() {
      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': true,
          focusable: 'false',
        },
        h('path', {
          d: 'M4.5 6.25 8 9.75l3.5-3.5',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    function ArrowGlyph() {
      return h(
        'svg',
        {
          width: 12,
          height: 12,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': true,
          focusable: 'false',
        },
        h('path', {
          d: 'M3 8h9M8.75 4.25 12.5 8l-3.75 3.75',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    function SearchGlyph() {
      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': true,
          focusable: 'false',
        },
        h('circle', { cx: 7, cy: 7, r: 4.5, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', {
          d: 'm10.5 10.5 3 3',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
        }),
      )
    }

    /**
     * Render a card field: `**corrected**` spans become green marks and
     * `~~removed~~` spans become red struck-through deletions. Falls back to the
     * plain field when an older card has no segments.
     */
    function RichText({ parts, text }) {
      if (!Array.isArray(parts) || parts.length === 0) return text ?? null
      return h(
        React.Fragment,
        null,
        parts.map((part, index) => {
          if (part.strike) return h('del', { key: index, className: 'elc-del' }, part.text)
          if (part.strong) return h('mark', { key: index, className: 'elc-hl' }, part.text)
          return part.text
        }),
      )
    }

    /** Corrected sentence that leads a source group. */
    function GroupCorrected({ group }) {
      if (!group.corrected) return null
      return h(
        'p',
        { className: 'elc-group-corrected' },
        '\u201c',
        h(RichText, { parts: group.correctedParts, text: group.corrected }),
        '\u201d',
      )
    }

    /** One teaching card listed below its source sentence. */
    function GroupCardEntry({ card }) {
      return h(
        'li',
        { className: 'elc-group-item' },
        h(
          'p',
          { className: 'elc-group-item-title' },
          h('span', { className: 'elc-note-title' }, card.title),
          card.titleAlt
            ? h('span', { className: 'elc-title-alt' }, ' \u00b7 ' + card.titleAlt)
            : null,
        ),
        card.rule
          ? h('p', { className: 'elc-rule' }, h(RichText, { parts: card.ruleParts, text: card.rule }))
          : null,
        card.example
          ? h(
              'p',
              { className: 'elc-example' },
              '\u201c',
              h(RichText, { parts: card.exampleParts, text: card.example }),
              '\u201d',
            )
          : null,
      )
    }

    /** Per-card link back to the turn that produced the note. */
    function TurnChip({ source, t, onLocate }) {
      const turn =
        source !== null && typeof source === 'object' && typeof source.turn === 'number' && source.turn > 0
          ? source.turn
          : null
      if (turn === null || typeof onLocate !== 'function') return null
      const label = (t('turnPrefix') + ' ' + turn + ' ' + t('turnSuffix')).trim()
      return h(
        'button',
        {
          type: 'button',
          className: 'elc-locate',
          'aria-label': t('openTurn') + ' \u00b7 ' + label,
          onClick: () => onLocate(source),
        },
        h('span', null, label),
        h('span', { className: 'elc-locate-arrow', 'aria-hidden': true }, h(ArrowGlyph)),
      )
    }

    /** One source sentence and every teaching card that belongs to it. */
    function GroupFace({ group, t, index, onLocate, nodeRef, current }) {
      const first = group.cards[0]
      return h(
        'article',
        {
          ref: nodeRef,
          role: 'listitem',
          className: 'elc-note elc-source-note',
          'data-current': current ? 'true' : undefined,
          'data-elc-pattern': first !== undefined ? first.title : '',
          style: index < 6 ? { animationDelay: index * 25 + 'ms' } : undefined,
        },
        h(
          'div',
          { className: 'elc-note-head' },
          h('span', { className: 'elc-index', 'aria-hidden': true }, String(index + 1).padStart(2, '0')),
          group.cards.length > 1
            ? h(
                'span',
                { className: 'elc-source-count' },
                group.cards.length + ' ' + t('cardsLabel'),
              )
            : null,
          current ? h('span', { className: 'elc-new' }, t('thisTurn')) : null,
          h(TurnChip, { source: group.source, t, onLocate }),
        ),
        h(GroupCorrected, { group }),
        h(
          'ul',
          { className: 'elc-group-list' },
          group.cards.map((card) => h(GroupCardEntry, { key: card.id, card })),
        ),
      )
    }

    /** Group label used in the collapsed preview. */
    function groupPattern(group, t) {
      if (group.cards.length === 1) return group.cards[0].title
      return group.cards.length + ' ' + t('cardsLabel')
    }

    /** Normalize a projection into source groups, tolerating an older host. */
    function groupsOf(projection) {
      if (
        projection !== null &&
        typeof projection === 'object' &&
        Array.isArray(projection.groups) &&
        projection.groups.length > 0
      ) {
        return projection.groups
      }
      const cards =
        projection !== null && typeof projection === 'object' && Array.isArray(projection.cards)
          ? projection.cards
          : EMPTY_CARDS
      return cards.map((card) => ({
        id: card.id,
        sourceText:
          typeof card.sourceText === 'string'
            ? card.sourceText
            : typeof card.original === 'string'
              ? card.original
              : '',
        corrected: card.corrected,
        correctedParts: card.correctedParts,
        cards: [card],
        seq: card.seq,
        source: card.source,
      }))
    }

    /**
     * Display order for a deck built across messages: the newest message's
     * source groups come first, but groups from one message keep their order.
     */
    function newestGroupsFirst(groups) {
      if (groups.length < 2) return groups
      const buckets = new Map()
      for (const group of groups) {
        const key = typeof group.seq === 'number' && group.seq > 0 ? group.seq : group
        const bucket = buckets.get(key)
        if (bucket === undefined) buckets.set(key, [group])
        else bucket.push(group)
      }
      const ordered = []
      const list = Array.from(buckets.values())
      for (let at = list.length - 1; at >= 0; at -= 1) {
        for (const group of list[at]) ordered.push(group)
      }
      return ordered
    }

    /**
     * Source groups written for the same turn as the newest group, in deck
     * order. The collapsed deck lists these so several independent sentences
     * from one reply are visible at a glance.
     */
    function newestTurnGroups(ordered) {
      if (ordered.length === 0) return EMPTY_CARDS
      const turn = typeof ordered[0].source?.turn === 'number' ? ordered[0].source.turn : -1
      if (turn <= 0) return [ordered[0]]
      const group = ordered.filter((item) => item.source?.turn === turn)
      return group.length > 0 ? group : [ordered[0]]
    }

    /**
     * Ambient deck above the composer: collapsed it reads as the top card of a
     * stack; expanded it becomes a scrollable study sheet. A single grid row
     * animates the disclosure from 0fr to 1fr without measuring.
     */
    function EnglishLearningCard(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => en[key] ?? key
      const projection = props.useProjection(PROJECTION_KEY)
      const cards =
        projection !== null && typeof projection === 'object' && Array.isArray(projection.cards)
          ? projection.cards
          : EMPTY_CARDS
      const groups = groupsOf(projection)
      const [open, setOpen] = React.useState(false)
      const reactId = React.useId()
      const bodyId = reactId + '-elc-body'
      const ordered = newestGroupsFirst(groups)
      const latest = ordered.length > 0 ? ordered[0] : undefined
      const hint = open ? t('hide') : cards.length > 0 ? t('show') : t('waiting')
      const openLibrary = typeof props.openLibrary === 'function' ? props.openLibrary : undefined
      const locateTurn = typeof props.locateTurn === 'function' ? props.locateTurn : undefined
      const onLocate =
        locateTurn !== undefined ? (source) => locateTurn(props.sessionId, source) : undefined
      const turnGroups = newestTurnGroups(ordered)
      const turnCardCount = turnGroups.reduce((sum, group) => sum + group.cards.length, 0)
      // The current turn comes from the projection, not from the newest group:
      // a message without corrections must not inherit last turn's highlight.
      // New hosts send the session's current turn in the view. An older host
      // (host code loads only on a full app restart) sends cards alone; fall
      // back to the newest group's turn so the latest correction still lights up.
      const viewTurn =
        projection !== null && typeof projection === 'object' && typeof projection.turn === 'number'
          ? projection.turn
          : undefined
      const newestGroupTurn =
        ordered.length > 0 && typeof ordered[0].source?.turn === 'number'
          ? ordered[0].source.turn
          : -1
      const currentTurn = viewTurn !== undefined ? viewTurn : newestGroupTurn

      // A send clears last turn's highlight immediately, before the host commits
      // the new turn: the submission echo is synchronous, so the deck remembers
      // which cards already existed and treats only later arrivals as current.
      const useSession = typeof props.useSession === 'function' ? props.useSession : useNoSession
      const pendingSubmissions = useSession((snapshot) =>
        snapshot !== null && typeof snapshot === 'object' ? snapshot.pendingSubmissions : undefined,
      )
      const latestSendId =
        Array.isArray(pendingSubmissions) && pendingSubmissions.length > 0
          ? pendingSubmissions[pendingSubmissions.length - 1].requestId
          : null
      const cardsRef = React.useRef(cards)
      cardsRef.current = cards
      const [sentBaseline, setSentBaseline] = React.useState(null)
      const sessionKey = typeof props.sessionId === 'string' ? props.sessionId : null
      React.useEffect(() => {
        setSentBaseline(null)
      }, [sessionKey])
      React.useEffect(() => {
        if (latestSendId === null) return
        setSentBaseline((current) =>
          current !== null && current.requestId === latestSendId
            ? current
            : { requestId: latestSendId, ids: new Set(cardsRef.current.map((card) => card.id)) },
        )
      }, [latestSendId])

      const isCurrentGroup = (group) => {
        if (sentBaseline !== null) return group.cards.some((card) => !sentBaseline.ids.has(card.id))
        return typeof group.source?.turn === 'number' && group.source.turn === currentTurn
      }
      const previewIsCurrent = turnGroups.length > 0 && isCurrentGroup(turnGroups[0])
      const rootRef = React.useRef(null)
      const groupNodes = React.useRef(new Map())
      const registerGroup = (id) => (node) => {
        if (node) groupNodes.current.set(id, node)
        else groupNodes.current.delete(id)
      }
      const revealGroup = (group) => {
        setOpen(true)
        window.setTimeout(() => {
          const node = groupNodes.current.get(group.id)
          if (node !== undefined && typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({ block: 'nearest' })
          }
        }, 280)
      }

      return h(
        'section',
        { ref: rootRef, className: 'elc', 'aria-label': t('aria'), 'data-dsh-english-cards': '' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'elc-dock' },
          h(
            'div',
            { className: 'elc-stack', 'data-open': open },
            cards.length > 1 ? h('span', { className: 'elc-layer', 'aria-hidden': true }) : null,
            cards.length > 1 ? h('span', { className: 'elc-layer elc-layer--2', 'aria-hidden': true }) : null,
            h(
              'div',
              { className: 'elc-card' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'elc-head',
                  'aria-expanded': open,
                  'aria-controls': bodyId,
                  onClick: () => setOpen((value) => !value),
                },
                h('span', { className: 'elc-badge' }, h(BookGlyph)),
                h('span', { className: 'elc-title' }, t('title')),
                cards.length > 0
                  ? h(
                      'span',
                      { key: cards.length, className: 'elc-count', 'data-elc-count': cards.length },
                      String(cards.length),
                    )
                  : null,
                h('span', { className: 'elc-hint' }, hint),
                h('span', { className: 'elc-chevron', 'data-open': open }, h(Chevron)),
              ),
              !open && turnGroups.length > 1
                ? h(
                    'div',
                    {
                      key: 'turn-list',
                      className: 'elc-preview elc-preview--list',
                      'data-current': previewIsCurrent ? 'true' : undefined,
                    },
                    ...turnGroups.slice(0, 5).map((group, index) =>
                      h(
                        'button',
                        {
                          key: group.id,
                          type: 'button',
                          className: 'elc-preview-row',
                          'aria-label': groupPattern(group, t) + ': ' + group.corrected,
                          onClick: () => revealGroup(group),
                        },
                        h(
                          'span',
                          { className: 'elc-preview-index', 'aria-hidden': true },
                          String(index + 1).padStart(2, '0'),
                        ),
                        h('span', { className: 'elc-pattern' }, groupPattern(group, t)),
                        h('span', { className: 'elc-sep', 'aria-hidden': true }),
                        h(
                          'span',
                          { className: 'elc-preview-text' },
                          group.corrected
                            ? h(
                                React.Fragment,
                                null,
                                '\u201c',
                                h(RichText, { parts: group.correctedParts, text: group.corrected }),
                                '\u201d',
                              )
                            : group.cards[0]?.rule,
                        ),
                      ),
                    ),
                    previewIsCurrent
                      ? h(
                          'span',
                          { className: 'elc-preview-more' },
                          turnCardCount + ' ' + t('correctionsInMessage'),
                        )
                      : null,
                  )
                : latest !== undefined && !open
                  ? h(
                      'div',
                      {
                        key: latest.id,
                        className: 'elc-preview',
                        'data-current': previewIsCurrent ? 'true' : undefined,
                      },
                      h('span', { className: 'elc-pattern' }, groupPattern(latest, t)),
                      h('span', { className: 'elc-sep', 'aria-hidden': true }),
                      h(
                        'span',
                        { className: 'elc-preview-text' },
                        latest.corrected
                          ? h(
                              React.Fragment,
                              null,
                              '\u201c',
                              h(RichText, { parts: latest.correctedParts, text: latest.corrected }),
                              '\u201d',
                            )
                          : latest.cards[0]?.rule,
                      ),
                    )
                  : null,
              h(
                'div',
                { className: 'elc-expand', 'data-open': open, 'aria-hidden': !open },
                h(
                  'div',
                  { className: 'elc-expand-inner' },
                  h(
                    'div',
                    { className: 'elc-body', id: bodyId, role: cards.length > 0 ? 'list' : undefined },
                    ordered.length === 0
                      ? h(
                          'div',
                          { className: 'elc-empty' },
                          h('span', { className: 'elc-empty-art' }, h(BookGlyph)),
                          h(
                            'div',
                            { className: 'elc-empty-copy' },
                            h('span', { className: 'elc-empty-title' }, t('emptyTitle')),
                            h('span', { className: 'elc-empty-body' }, t('emptyBody')),
                          ),
                        )
                      : ordered.map((group, index) =>
                          h(GroupFace, {
                            key: group.id,
                            group,
                            t,
                            index,
                            current: isCurrentGroup(group),
                            nodeRef: registerGroup(group.id),
                            onLocate: open ? onLocate : undefined,
                          }),
                        ),
                  ),
                  openLibrary !== undefined
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'elc-library',
                          tabIndex: open ? 0 : -1,
                          onClick: openLibrary,
                        },
                        h('span', null, t('openLibrary')),
                        h('span', { className: 'elc-library-arrow', 'aria-hidden': true }, h(ArrowGlyph)),
                      )
                    : null,
                ),
              ),
            ),
          ),
        ),
      )
    }

    /** One source group in the library. */
    function LibraryEntry({ group, t, index, onLocate }) {
      const first = group.cards[0]
      return h(
        'article',
        {
          className: 'elc-entry elc-source-entry',
          'data-elc-pattern': first !== undefined ? first.title : '',
        },
        h(
          'div',
          { className: 'elc-note-head' },
          h('span', { className: 'elc-index', 'aria-hidden': true }, String(index + 1).padStart(2, '0')),
          group.cards.length > 1
            ? h('span', { className: 'elc-source-count' }, group.cards.length + ' ' + t('cardsLabel'))
            : null,
          h(TurnChip, { source: group.source, t, onLocate }),
        ),
        h(GroupCorrected, { group }),
        h(
          'ul',
          { className: 'elc-group-list' },
          group.cards.map((card) => h(GroupCardEntry, { key: card.id, card })),
        ),
      )
    }

    /** Every session's source groups, newest conversation first. */
    function groupsFromList(list) {
      if (list === null || typeof list !== 'object') return []
      const ids = Array.isArray(list.ids) ? list.ids : []
      const byId = list.byId !== null && typeof list.byId === 'object' ? list.byId : {}
      const stores =
        list.projectionsBySession !== null && typeof list.projectionsBySession === 'object'
          ? list.projectionsBySession
          : {}
      const groups = []
      for (const id of ids) {
        const summary = byId[id]
        if (summary === undefined || summary === null || summary.origin === 'subagent') continue
        const stored = stores[id]
        const values = stored !== null && typeof stored === 'object' ? stored.values : undefined
        const deck = values !== null && typeof values === 'object' ? values[PROJECTION_KEY] : undefined
        const cards =
          deck !== null && typeof deck === 'object' && Array.isArray(deck.cards) ? deck.cards : null
        const cardGroups =
          deck !== null && typeof deck === 'object' && Array.isArray(deck.groups) && deck.groups.length > 0
            ? newestGroupsFirst(deck.groups)
            : cards !== null && cards.length > 0
              ? newestGroupsFirst(groupsOf({ cards }))
              : []
        if (cardGroups.length === 0) continue
        const title =
          typeof summary.displayTitle === 'string' && summary.displayTitle.length > 0
            ? summary.displayTitle
            : String(id)
        groups.push({
          id,
          title,
          updatedAt: typeof summary.updatedAt === 'number' ? summary.updatedAt : 0,
          cardGroups,
        })
      }
      groups.sort((left, right) => right.updatedAt - left.updatedAt)
      return groups
    }

    function cardMatches(card, sessionTitle, query) {
      // The corrected field is the clean final sentence; the segments also hold
      // the struck-through original words, so search covers both sides.
      const correctedText = Array.isArray(card.correctedParts)
        ? card.correctedParts.map((part) => part.text).join('')
        : card.corrected
      const haystack = [
        card.title,
        card.titleAlt,
        card.sourceText,
        card.original,
        correctedText,
        card.rule,
        card.example,
        sessionTitle,
      ]
        .map((value) => (typeof value === 'string' ? value : ''))
        .join('\n')
        .toLowerCase()
      return haystack.includes(query)
    }

    /** Match a whole source group when either its sentence or any card matches. */
    function groupMatches(group, sessionTitle, query) {
      if (typeof group.corrected === 'string' && group.corrected.toLowerCase().includes(query)) {
        return true
      }
      return group.cards.some((card) => cardMatches(card, sessionTitle, query))
    }

    /** Rebuild the server's ~~removed~~ / **replacement** markup from parts. */
    function markupFromParts(parts) {
      if (!Array.isArray(parts) || parts.length === 0) return ''
      let out = ''
      let open = ''
      for (const part of parts) {
        if (part === null || typeof part !== 'object') continue
        if (typeof part.text !== 'string' || part.text.length === 0) continue
        const next = part.strike === true ? '~~' : part.strong === true ? '**' : ''
        if (next !== open) {
          if (open.length > 0) out += open
          if (next.length > 0) out += next
          open = next
        }
        out += part.text
      }
      if (open.length > 0) out += open
      return out
    }

    /** Flatten every local session group into one sentence per source text. */
    function backfillSentences(groups) {
      const bySource = new Map()
      // groups arrive newest-first; the server creates rows in send order, so
      // historical cards must go oldest-first to keep the review timeline.
      const sessions = [...(Array.isArray(groups) ? groups : [])].reverse()
      for (const session of sessions) {
        const cardGroups = [...(Array.isArray(session?.cardGroups) ? session.cardGroups : [])].reverse()
        for (const group of cardGroups) {
          const source =
            typeof group?.sourceText === 'string' && group.sourceText.trim().length > 0
              ? group.sourceText.trim()
              : typeof group?.corrected === 'string'
                ? group.corrected.trim()
                : ''
          if (source.length === 0) continue
          const key = source.toLowerCase()
          let entry = bySource.get(key)
          if (entry === undefined) {
            entry = {
              corrected: markupFromParts(group.correctedParts) || group.corrected || source,
              source_text: source,
              cards: new Map(),
            }
            bySource.set(key, entry)
          }
          const cards = Array.isArray(group.cards) ? group.cards : []
          for (const card of cards) {
            const title = [card?.title, card?.titleAlt]
              .filter((part) => typeof part === 'string' && part.trim().length > 0)
              .join(' · ')
              .slice(0, 255)
            if (title.length === 0) continue
            entry.cards.set(title, {
              title,
              rule: typeof card.rule === 'string' ? card.rule : '',
              example: typeof card.example === 'string' ? card.example : '',
            })
          }
        }
      }
      return [...bySource.values()]
        .map((entry) => ({
          corrected: entry.corrected,
          source_text: entry.source_text,
          cards: [...entry.cards.values()].slice(0, 10),
        }))
        .filter((sentence) => sentence.corrected.length > 0 && sentence.cards.length > 0)
    }

    /** Header switch for syncing cards to Aoi. */
    function SyncControl({ t, groups, ready }) {
      const [state, setState] = React.useState(null)
      const [unavailable, setUnavailable] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const attempted = React.useRef(false)
      const groupsRef = React.useRef(groups)
      groupsRef.current = groups

      const load = React.useCallback(async () => {
        try {
          const response = await fetch('/api/dsh-english-cards/sync', {
            headers: { accept: 'application/json' },
            cache: 'no-store',
          })
          if (!response.ok) {
            setUnavailable(true)
            return
          }
          const data = await response.json()
          if (data?.ok !== true) {
            setUnavailable(true)
            return
          }
          setState(data)
          setUnavailable(false)
        } catch {
          setUnavailable(true)
        }
      }, [])

      React.useEffect(() => {
        load()
      }, [load])

      React.useEffect(() => {
        const delay = state?.authPending
          ? 1_500
          : state?.enabled
            ? 30_000
            : unavailable
              ? 5_000
              : 0
        if (delay === 0) return undefined
        const timer = setInterval(load, delay)
        return () => clearInterval(timer)
      }, [state?.authPending, state?.enabled, unavailable, load])

      const post = React.useCallback(async (body) => {
        setBusy(true)
        try {
          const response = await fetch('/api/dsh-english-cards/sync', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          const data = await response.json()
          if (data?.ok === true) {
            setState(data)
            setUnavailable(false)
            return true
          }
          return false
        } catch {
          setUnavailable(true)
          return false
        } finally {
          setBusy(false)
        }
      }, [])

      React.useEffect(() => {
        if (attempted.current) return
        if (ready !== true) return
        if (!Array.isArray(groups) || groups.length === 0) return
        if (state?.enabled !== true || state?.authenticated !== true) return
        if (typeof state?.backfilledAt === 'number' && state.backfilledAt > 0) return
        attempted.current = true
        const sentences = backfillSentences(groupsRef.current)
        if (sentences.length === 0) {
          attempted.current = false
          return
        }
        void post({ action: 'backfill', sentences }).then((ok) => {
          if (!ok) attempted.current = false
        })
      }, [state, ready, groups?.length, post])

      const toggle = () => {
        if (busy) return
        if (state?.authPending) {
          if (typeof state.authUrl === 'string' && state.authUrl.length > 0) {
            window.open(state.authUrl, '_blank', 'noopener,noreferrer')
          }
          return
        }
        if (state === null || state.authenticated !== true || state.needsAuth === true) {
          void post({ action: 'auth' })
          return
        }
        void post({ action: 'settings', enabled: state.enabled !== true })
      }

      const on = state?.enabled === true && state.authenticated === true
      const pending = state?.authPending === true
      const expired = state?.needsAuth === true && !pending
      const disabled = busy || pending || state === null

      let note = null
      if (pending) {
        note = h(
          'span',
          { className: 'elc-sync-note' },
          t('syncWaiting'),
          typeof state?.authUrl === 'string' && state.authUrl.length > 0
            ? h('a', { href: state.authUrl, target: '_blank', rel: 'noreferrer' }, ' · ' + t('syncAuthLink'))
            : null,
        )
      } else if (expired) {
        note = h('span', { className: 'elc-sync-note' }, t('syncExpired'))
      } else if (unavailable && state === null) {
        note = h('span', { className: 'elc-sync-note' }, t('syncError'))
      }

      return h(
        'div',
        { className: 'elc-page-actions' },
        h(
          'div',
          {
            className: 'elc-sync-control',
            'data-on': on ? 'true' : 'false',
            title: typeof state?.lastError === 'string' && state.lastError.length > 0 ? state.lastError : undefined,
          },
          h('span', { className: 'elc-sync-label' }, t('syncToAoi')),
          h('button', {
            type: 'button',
            role: 'switch',
            className: 'elc-sync-switch',
            'aria-checked': on,
            'aria-label': t('syncToAoi'),
            disabled,
            onClick: toggle,
          }),
          note,
        ),
        on
          ? h(
              'a',
              {
                className: 'elc-review-link',
                href: state.reviewUrl,
                target: '_blank',
                rel: 'noreferrer',
              },
              t('review'),
            )
          : null,
      )
    }

    /** The English Cards main panel: search, sessions, and every collected card. */
    function EnglishCardsPage(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => en[key] ?? key
      const list = props.useSessions((snapshot) => snapshot) ?? EMPTY_LIST
      const [query, setQuery] = React.useState('')
      const openSession = typeof props.openSession === 'function' ? props.openSession : () => {}
      const openConversation = typeof props.openConversation === 'function' ? props.openConversation : () => {}
      const locateTurn = typeof props.locateTurn === 'function' ? props.locateTurn : undefined

      const groups = groupsFromList(list)
      const total = groups.reduce(
        (sum, group) =>
          sum + group.cardGroups.reduce((count, cardGroup) => count + cardGroup.cards.length, 0),
        0,
      )
      const needle = query.trim().toLowerCase()
      const visible =
        needle.length === 0
          ? groups
          : groups
              .map((group) => ({
                ...group,
                cardGroups: group.cardGroups.filter((cardGroup) =>
                  groupMatches(cardGroup, group.title, needle),
                ),
              }))
              .filter((group) => group.cardGroups.length > 0)

      const stats =
        total > 0
          ? h(
              'span',
              { className: 'elc-stats' },
              h('strong', null, String(total)),
              ' ',
              total === 1 ? t('cardOne') : t('cardsLabel'),
              ' \u00b7 ',
              h('strong', null, String(groups.length)),
              ' ',
              groups.length === 1 ? t('sessionOne') : t('sessionsLabel'),
            )
          : null

      let body
      if (list.phase === 'pending' && total === 0) {
        body = h('p', { className: 'elc-page-status', role: 'status' }, t('loading'))
      } else if (total === 0) {
        body = h(
          'div',
          { className: 'elc-page-empty' },
          h('span', { className: 'elc-page-empty-art' }, h(SpeechCardGlyph, { size: 22 })),
          h('h2', { className: 'elc-page-empty-title' }, t('pageEmptyTitle')),
          h('p', { className: 'elc-page-empty-body' }, t('pageEmptyBody')),
          h(
            'button',
            { type: 'button', className: 'elc-action', onClick: openConversation },
            h('span', null, t('backToConversation')),
            h('span', { 'aria-hidden': true, className: 'elc-open-arrow' }, h(ArrowGlyph)),
          ),
        )
      } else if (visible.length === 0) {
        body = h(
          'div',
          { className: 'elc-page-empty' },
          h('h2', { className: 'elc-page-empty-title' }, t('noResults')),
          h(
            'button',
            { type: 'button', className: 'elc-action', onClick: () => setQuery('') },
            h('span', null, t('clearSearch')),
          ),
        )
      } else {
        body = h(
          'div',
          { className: 'elc-page-body' },
          visible.map((group) => {
            const cardCount = group.cardGroups.reduce(
              (sum, cardGroup) => sum + cardGroup.cards.length,
              0,
            )
            return h(
              'section',
              { key: group.id, className: 'elc-group' },
              h(
                'div',
                { className: 'elc-group-head' },
                h('h2', { className: 'elc-group-title', title: group.title }, group.title),
                h(
                  'span',
                  { className: 'elc-group-count' },
                  cardCount + ' ' + (cardCount === 1 ? t('cardOne') : t('cardsLabel')),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'elc-open',
                    'aria-label': t('openSession') + ' ' + group.title,
                    onClick: () => openSession(group.id),
                  },
                  h('span', null, t('openSession')),
                  h('span', { className: 'elc-open-arrow', 'aria-hidden': true }, h(ArrowGlyph)),
                ),
              ),
              h(
                'div',
                { className: 'elc-entries' },
                group.cardGroups.map((cardGroup, index) =>
                  h(LibraryEntry, {
                    key: cardGroup.id,
                    group: cardGroup,
                    t,
                    index,
                    onLocate:
                      locateTurn !== undefined
                        ? (source) => locateTurn(group.id, source)
                        : undefined,
                  }),
                ),
              ),
            )
          }),
        )
      }

      return h(
        'section',
        { className: 'elc-page', 'data-english-cards-panel': '' },
        h('style', null, CSS),
        h(
          'header',
          { className: 'elc-page-head', 'data-window-drag': true },
          h(
            'div',
            { className: 'elc-page-heading' },
            h('h1', { className: 'elc-page-title' }, t('panelTitle')),
            h('p', { className: 'elc-page-intro' }, t('panelIntro')),
          ),
          h(SyncControl, { t, groups, ready: list.phase !== 'pending' }),
        ),
        total > 0
          ? h(
              'div',
              { className: 'elc-page-toolbar' },
              h(
                'label',
                { className: 'elc-search' },
                h('span', { className: 'elc-search-glyph', 'aria-hidden': true }, h(SearchGlyph)),
                h('input', {
                  type: 'search',
                  value: query,
                  placeholder: t('searchPlaceholder'),
                  'aria-label': t('searchLabel'),
                  spellCheck: false,
                  onChange: (event) => setQuery(event.target.value),
                }),
              ),
              stats,
            )
          : null,
        body,
      )
    }

    /** Sidebar glyph; the shell owns the button and its label. */
    function CardsPanelIcon({ size }) {
      return h(SpeechCardGlyph, { size: typeof size === 'number' ? size : 20 })
    }

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-english-cards: dictionaries')
        const t = ctx.locale.bind(NS)
        const openLibrary = () => ctx.layout.selectPanel(PANEL_ID)
        const openConversation = () => ctx.layout.selectPanel('conversation')
        const openSession = (sessionId) => {
          openConversation()
          const workspace = ctx.get('uiWorkspace')
          if (workspace !== undefined && typeof workspace.openSession === 'function') {
            workspace.openSession(sessionId)
          }
        }

        // Best-effort turn focus. The Chat view exposes no public scroll API;
        // its rows carry `data-chat-turn`, so one query doubles as a feature
        // check and degrades to simply opening the conversation.
        const prefersReducedMotion = () =>
          typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
        const scrollToTurnRow = (turn) => {
          if (typeof document === 'undefined') return false
          const rows = document.querySelectorAll('[data-chat-turn="' + turn + '"]')
          if (rows.length === 0) return false
          let row = null
          for (const candidate of rows) {
            if (candidate.getAttribute('data-chat-flow-kind') === 'user') {
              row = candidate
              break
            }
          }
          if (row === null) row = rows[0]
          if (row === null || typeof row.scrollIntoView !== 'function') return false
          try {
            row.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
          } catch {
            return false
          }
          return true
        }
        const locateTurn = (sessionId, source) => {
          openConversation()
          const workspace = ctx.get('uiWorkspace')
          if (workspace !== undefined && typeof workspace.openSession === 'function') {
            workspace.openSession(sessionId)
          }
          const turn =
            source !== null && typeof source === 'object' && typeof source.turn === 'number'
              ? source.turn
              : -1
          if (turn <= 0) return
          const userSeq =
            source !== null && typeof source === 'object' && typeof source.userSeq === 'number'
              ? source.userSeq
              : -1
          let requested = false
          let attempts = 0
          const attempt = () => {
            if (scrollToTurnRow(turn)) return
            if (!requested && userSeq >= 0) {
              const sessions = ctx.get('sessions')
              const binding =
                sessions !== undefined && typeof sessions.binding === 'function'
                  ? sessions.binding(sessionId)
                  : undefined
              const session = binding !== undefined ? binding.session : undefined
              if (session !== undefined && typeof session.loadThrough === 'function') {
                requested = true
                try {
                  const loading = session.loadThrough(userSeq)
                  if (loading !== undefined && typeof loading.catch === 'function') loading.catch(() => {})
                } catch {}
              }
            }
            attempts += 1
            if (attempts < 40) setTimeout(attempt, 100)
          }
          attempt()
        }

        ctx.slots.inject('conversation.input.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.dock',
              id: 'dsh-english-cards',
              order: 30,
              locale: NS,
              inject: () => ({ openLibrary, locateTurn }),
            },
            EnglishLearningCard,
          ),
        )

        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              locale: NS,
              inject: () => ({ openSession, openConversation, locateTurn }),
            },
            EnglishCardsPage,
          ),
        )

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 5,
              label: () => t('panel'),
              locale: NS,
            },
            CardsPanelIcon,
          ),
        )
      },
    }
  },
})
