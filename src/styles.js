export const STYLE = `
.wc-root { --wc-accent: #3f7d5c; font: inherit; color: inherit; display: flex; flex-direction: column; gap: 12px; max-height: 74dvh; min-height: 240px; min-width: 0; padding: 2px; }
.wc-root *, .wc-root *::before, .wc-root *::after { box-sizing: border-box; }
.wc-root [hidden] { display: none !important; }
.wc-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.wc-input, .wc-select, .wc-textarea { min-width: 0; width: 100%; padding: 10px 12px; border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 9px; background: transparent; color: inherit; font: inherit; font-size: 13px; }
.wc-select { flex: 1 1 140px; width: auto; }
.wc-select option { color: CanvasText; background: Canvas; }
.wc-textarea { min-height: 120px; resize: vertical; line-height: 1.7; }
.wc-root label { font-size: 12px; }
.wc-btn { border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 8px; background: transparent; color: inherit; padding: 8px 12px; font: inherit; font-size: 13px; cursor: pointer; }
.wc-btn:hover { background: color-mix(in srgb, currentColor 6%, transparent); }
.wc-btn.primary { background: var(--wc-accent); border-color: var(--wc-accent); color: white; }
.wc-root button:disabled { opacity: .48; cursor: default; }
.wc-root :is(button,input,select,textarea,summary,a):focus-visible { outline: 2px solid var(--wc-accent); outline-offset: 2px; }
.wc-label { display: grid; gap: 6px; }
.wc-hint, .wc-status { font-size: 12px; line-height: 1.65; margin: 0; overflow-wrap: anywhere; }
.wc-hint { opacity: .68; }
.wc-status { padding: 9px 11px; border-radius: 8px; background: color-mix(in srgb, var(--wc-accent) 9%, transparent); }
.wc-status[data-error="true"] { background: color-mix(in srgb, #a66a24 12%, transparent); }
.wc-content { overflow: auto; min-height: 0; flex: 1 1 auto; padding: 2px; overscroll-behavior: contain; }
.wc-draft { display: grid; gap: 10px; }
.wc-preview { padding: 16px; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 10px; font-size: 14px; line-height: 1.8; overflow-wrap: anywhere; }
.wc-preview :is(h1,h2,h3,h4) { line-height: 1.4; margin: 1.1em 0 .6em; }
.wc-preview :first-child { margin-top: 0; }
.wc-preview p { margin: .7em 0; }
.wc-preview a { color: inherit; text-decoration: underline; }
.wc-preview blockquote { margin: 10px 0; border-left: 3px solid var(--wc-accent); padding-left: 14px; opacity: .8; }
.wc-preview pre { overflow: auto; padding: 12px; background: color-mix(in srgb, currentColor 7%, transparent); border-radius: 6px; }
.wc-preview table { border-collapse: collapse; display: block; overflow: auto; max-width: 100%; }
.wc-preview th, .wc-preview td { border: 1px solid color-mix(in srgb, currentColor 18%, transparent); padding: 6px 10px; }
.wc-image-placeholder { display: block; padding: 12px; border: 1px dashed color-mix(in srgb, currentColor 23%, transparent); border-radius: 7px; font-size: 12px; opacity: .7; }
.wc-footer { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent); padding-top: 10px; }
.wc-manual { padding: 10px 0 2px; }
.wc-manual summary { cursor: pointer; font-size: 12px; margin-bottom: 8px; }
.wc-manual .wc-btn { margin-top: 8px; }
.wc-feed-item { padding: 12px 0; border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent); }
.wc-feed-title { font-size: 14px; font-weight: 600; margin: 0 0 6px; }
.wc-feed-item .wc-row { margin-top: 8px; }
@media (max-width: 420px) { .wc-root { max-height: 82dvh; gap: 9px; } .wc-btn { padding: 8px 10px; } .wc-preview { padding: 12px; } }
`;
