import { IfColorRule } from '../types';

/**
 * 从 libraryCatalog 字段中提取影响因子数值。
 * 支持格式："IF: 12.3"、"IF 1.9"、"IF:5"、纯数字 "12.3" 等。
 */
export function extractImpactFactor(libraryCatalog?: string): number | null {
  if (!libraryCatalog) return null;

  const match = libraryCatalog.match(/IF[:\s]*(\d+\.?\d*)/i);
  if (match) {
    return parseFloat(match[1]);
  }

  // 尝试直接解析纯数字
  const numeric = parseFloat(libraryCatalog.trim());
  if (!isNaN(numeric)) {
    return numeric;
  }

  return null;
}

/**
 * 将 IF 数值与用户配置的规则数组进行匹配。
 * 遍历规则，返回首条 min <= ifValue <= max 的规则。
 * max 为 null 表示正无穷。
 */
export function matchIfRule(
  ifValue: number | null,
  rules: IfColorRule[]
): IfColorRule | null {
  if (ifValue === null || !rules.length) return null;

  for (const rule of rules) {
    if (ifValue >= rule.min && (rule.max === null || ifValue <= rule.max)) {
      return rule;
    }
  }

  return null;
}

/**
 * 创建一条默认 IF 颜色规则。
 * className 基于索引自动生成。
 */
export function createIfRule(index: number): IfColorRule {
  return {
    id: `if-rule-${Date.now()}`,
    min: 0,
    max: null,
    bgColor: '#4CAF50',
    textColor: '#FFFFFF',
    borderColor: '#388E3C',
    className: `if-dynamic-${index}`,
  };
}

/**
 * 动态生成并注入 CSS 到 document.head。
 * 为每条规则生成精确命中 Obsidian Properties 面板的选择器。
 */
export function injectIfStyles(rules: IfColorRule[]): void {
  const styleId = 'zotero-if-dynamic-styles';
  let styleEl = document.head.querySelector<HTMLStyleElement>(`#${styleId}`);

  if (!rules.length) {
    if (styleEl) styleEl.remove();
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  const css = rules
    .map(
      (rule) =>
        `.${rule.className} .metadata-property[data-property-key="影响因子"] .multi-select-pill { background-color: ${rule.bgColor} !important; color: ${rule.textColor} !important; border: 1px solid ${rule.borderColor} !important; padding-left: 8px !important; padding-right: 8px !important; }`
    )
    .join('\n');

  styleEl.textContent = css;
}

/**
 * 移除动态注入的 IF 样式标签。
 * 在插件卸载时调用。
 */
export function removeIfStyles(): void {
  const styleEl = document.head.querySelector<HTMLStyleElement>(
    '#zotero-if-dynamic-styles'
  );
  if (styleEl) styleEl.remove();
}

/**
 * 动态注入/更新/移除标题跑马灯 CSS 并设置 DOM 结构。
 *
 * clip 挂到 .metadata-property 内部（position:absolute），随 Obsidian 内容自然滚动，
 * 无需 scroll 事件跟踪坐标。
 */
const TRACK_SELECTOR = '.zt-marquee-track';

let marqueeObserver: MutationObserver | null = null;
let marqueeRafId: number | null = null;
let marqueePollInterval: ReturnType<typeof setInterval> | null = null;
let marqueeDurationSec = 15;
const marqueeAnimations = new Map<HTMLElement, number>();
let marqueeIdCounter = 0;

// ── 动画引擎 ──

function startMarqueeAnimation(track: HTMLElement): void {
  stopMarqueeAnimation(track);

  let position = 0;
  let lastTime = performance.now();
  let animationId: number;

  function animate() {
    const now = performance.now();
    const delta = (now - lastTime) / 1000;
    lastTime = now;

    const halfWidth = track.scrollWidth / 2;
    const pxPerSecond = halfWidth / Math.max(marqueeDurationSec / 2, 0.5);
    position -= pxPerSecond * delta;
    if (position <= -halfWidth) position += halfWidth;
    if (position > 0) position -= halfWidth;

    track.style.transform = `translateX(${position}px)`;
    animationId = requestAnimationFrame(animate);
  }

  animationId = requestAnimationFrame(animate);
  marqueeAnimations.set(track, animationId);
}

function stopMarqueeAnimation(track: HTMLElement): void {
  const id = marqueeAnimations.get(track);
  if (id !== undefined) {
    cancelAnimationFrame(id);
    marqueeAnimations.delete(track);
  }
}

function stopAllMarqueeAnimations(): void {
  marqueeAnimations.forEach((id) => cancelAnimationFrame(id));
  marqueeAnimations.clear();
}

// ── clip 管理 ──

function removeSingleClip(clip: Element): void {
  const track = clip.querySelector<HTMLElement>(TRACK_SELECTOR);
  if (track) stopMarqueeAnimation(track);
  clip.remove();
}

/** 移除所有跑马灯 clip */
function removeAllClips(): void {
  document.querySelectorAll('.zt-marquee-clip').forEach((clip) => {
    removeSingleClip(clip);
  });
}

/** 获取不透明的背景色 */
function getOpaqueBg(el: HTMLElement): string {
  let cur: HTMLElement | null = el;
  while (cur) {
    const c = getComputedStyle(cur).backgroundColor;
    const transparent = c === 'transparent' || c === 'rgba(0, 0, 0, 0)' ||
      /^rgba\(\d+,\s*\d+,\s*\d+,\s*0(?:\.0+)?\)$/i.test(c);
    if (c && !transparent) return c;
    cur = cur.parentElement;
  }
  return 'var(--background-primary)';
}

/**
 * 为标题属性创建跑马灯 clip，挂到 .metadata-property 内部（position:absolute）。
 * clip 使用相对于 .metadata-property 的坐标，随页面自然滚动。
 */
function attachMarqueeToElement(titleProp: HTMLElement): void {
  try {
    const valueEl = titleProp.querySelector<HTMLElement>('.metadata-property-value');
    if (!valueEl || !valueEl.isConnected) return;

    const propRect = titleProp.getBoundingClientRect();
    const valueRect = valueEl.getBoundingClientRect();
    if (valueRect.width === 0 && valueRect.height === 0) return;

    // clip 相对于 .metadata-property 的偏移（滚定时保持不变）
    const left = valueRect.left - propRect.left;
    const top = valueRect.top - propRect.top;

    // 收集内容（快照 children，排除图标）
    const children = Array.from(valueEl.children) as HTMLElement[];
    const iconEl = titleProp.querySelector('.metadata-property-icon');
    let html = '';
    for (const child of children) {
      if (child === iconEl || !child.isConnected) continue;
      html += child.outerHTML || child.textContent || '';
    }
    html = html.trim();
    const text = children.reduce((s, c) => s + (c.textContent || ''), '').trim();
    if (!html || !text) return;

    // 分配唯一 ID
    let propId = titleProp.getAttribute('data-marquee-id');
    if (!propId) {
      propId = 'marquee-' + (++marqueeIdCounter);
      titleProp.setAttribute('data-marquee-id', propId);
    }

    const clip = document.createElement('span');
    clip.className = 'zt-marquee-clip';
    clip.setAttribute('data-prop-id', propId);
    clip.style.backgroundColor = getOpaqueBg(valueEl);
    clip.style.position = 'absolute';
    clip.style.left = left + 'px';
    clip.style.top = top + 'px';
    clip.style.width = valueRect.width + 'px';
    clip.style.height = valueRect.height + 'px';

    const track = document.createElement('span');
    track.className = 'zt-marquee-track';
    track.setAttribute('data-text', text);

    const c1 = document.createElement('span');
    c1.className = 'zt-marquee-copy';
    c1.innerHTML = html;
    const c2 = document.createElement('span');
    c2.className = 'zt-marquee-copy';
    c2.innerHTML = html;

    track.appendChild(c1);
    track.appendChild(c2);
    clip.appendChild(track);
    titleProp.appendChild(clip);
    startMarqueeAnimation(track);
  } catch (err) {
    console.error('[zt-marquee] attachMarqueeToElement failed:', err);
  }
}

// ── 更新策略 ──

/** 全清全建（仅初始化） */
function applyMarqueeToAll(): void {
  if (marqueeObserver) marqueeObserver.disconnect();
  removeAllClips();
  document.querySelectorAll<HTMLElement>(
    '.metadata-property[data-property-key="标题"]'
  ).forEach((prop) => {
    try {
      const valueEl = prop.querySelector<HTMLElement>('.metadata-property-value');
      if (!valueEl) return;
      if (valueEl.getBoundingClientRect().width === 0) return;
      attachMarqueeToElement(prop);
    } catch (err) { /* ignore */ }
  });
  if (marqueeObserver) {
    marqueeObserver.observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
    });
  }
}

/** 轻量 diff：删孤儿、补缺失。不销毁有效 clip（保持动画连续） */
function syncMarqueeState(): void {
  if (marqueeObserver) marqueeObserver.disconnect();

  // 1. 删除孤儿 clip
  document.querySelectorAll('.zt-marquee-clip').forEach((clip) => {
    const propId = clip.getAttribute('data-prop-id');
    if (!propId) { removeSingleClip(clip); return; }
    const prop = document.querySelector(`.metadata-property[data-property-key="标题"][data-marquee-id="${propId}"]`);
    if (!prop) { removeSingleClip(clip); return; }
    const valueEl = prop.querySelector('.metadata-property-value');
    if (!valueEl) { removeSingleClip(clip); return; }
    if (valueEl.getBoundingClientRect().width === 0) { removeSingleClip(clip); return; }
  });

  // 2. 补建缺失 clip
  document.querySelectorAll<HTMLElement>(
    '.metadata-property[data-property-key="标题"]'
  ).forEach((prop) => {
    try {
      const valueEl = prop.querySelector<HTMLElement>('.metadata-property-value');
      if (!valueEl) return;
      if (valueEl.getBoundingClientRect().width === 0) return;

      const propId = prop.getAttribute('data-marquee-id');
      const clip = propId
        ? prop.querySelector(`.zt-marquee-clip[data-prop-id="${propId}"]`)
        : null;

      if (!clip || !clip.isConnected) {
        attachMarqueeToElement(prop);
      }
    } catch (err) { /* ignore */ }
  });

  if (marqueeObserver) {
    marqueeObserver.observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
    });
  }
}

function scheduleMarqueeApply(): void {
  if (marqueeRafId !== null) return;
  marqueeRafId = requestAnimationFrame(() => {
    marqueeRafId = null;
    syncMarqueeState();
  });
}

// ── 对外 API ──

export function injectTitleMarqueeStyles(
  enabled: boolean,
  duration: number = 15
): void {
  marqueeDurationSec = duration;

  const styleId = 'zotero-title-marquee-styles';
  let styleEl = document.head.querySelector<HTMLStyleElement>(`#${styleId}`);

  if (!enabled) {
    if (marqueeObserver) { marqueeObserver.disconnect(); marqueeObserver = null; }
    if (marqueeRafId !== null) { cancelAnimationFrame(marqueeRafId); marqueeRafId = null; }
    if (marqueePollInterval) { clearInterval(marqueePollInterval); marqueePollInterval = null; }
    stopAllMarqueeAnimations();
    removeAllClips();
    if (styleEl) styleEl.remove();
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `
.metadata-property[data-property-key="\u6807\u9898"] {
  position: relative !important;
}
.zt-marquee-clip {
  pointer-events: none; overflow: hidden; display: flex; align-items: center; z-index: 1;
}
.zt-marquee-track {
  display: flex; flex-wrap: nowrap; width: max-content; will-change: transform;
  font: inherit; color: inherit;
}
.zt-marquee-copy {
  flex: 0 0 auto; box-sizing: content-box; padding-right: 2em;
  white-space: nowrap; font: inherit; color: inherit;
}
/* 禁止编辑标题属性值（链接仍可点击） */
.metadata-property[data-property-key="\u6807\u9898"] .metadata-property-value {
  pointer-events: none !important;
}
.metadata-property[data-property-key="\u6807\u9898"] .metadata-property-value * {
  pointer-events: auto !important;
}
`;

  applyMarqueeToAll();

  if (!marqueeObserver) {
    marqueeObserver = new MutationObserver(() => scheduleMarqueeApply());
    marqueeObserver.observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
    });
  }

  if (!marqueePollInterval) {
    marqueePollInterval = setInterval(() => syncMarqueeState(), 2000);
  }
}

export function removeTitleMarqueeStyles(): void {
  if (marqueeObserver) { marqueeObserver.disconnect(); marqueeObserver = null; }
  if (marqueeRafId !== null) { cancelAnimationFrame(marqueeRafId); marqueeRafId = null; }
  if (marqueePollInterval) { clearInterval(marqueePollInterval); marqueePollInterval = null; }
  stopAllMarqueeAnimations();
  removeAllClips();
  const styleEl = document.head.querySelector<HTMLStyleElement>('#zotero-title-marquee-styles');
  if (styleEl) styleEl.remove();
}
