/**
 * ZoteroDataProcessor - 文献评级动态双轨语义评价系统
 *
 * 废弃原本简陋的 Emoji 星标，采用防乱码 Unicode 转义序列，
 * 基于"阅读状态"实现 3+5 动态双轨语义评价系统。
 *
 * v2.1.0 重构
 */

// ═══════════════════════════════════════════════
// 步骤 1：符号与 Unicode 定义 (严格防乱码)
// ═══════════════════════════════════════════════

/** 实心星星 (Filled Star，用于填充) */
export const STAR_FILLED = '\u2605';

/** 空心星星 (Hollow Star，用于背景) */
export const STAR_HOLLOW = '\u2606';

// ═══════════════════════════════════════════════
// 步骤 2：阅读状态中文化 (Status Translation)
// ═══════════════════════════════════════════════

/** 阅读状态 → 三字中文短语映射表 */
export const STATUS_TRANSLATION: Record<string, string> = {
  unread: '待阅读',
  reading: '阅读中',
  done: '已完成',
};

/** 默认阅读状态（空值或异常状态回退） */
export const DEFAULT_STATUS = '待阅读';

/**
 * 将原始阅读状态标签翻译为三字中文短语。
 * unread → 待阅读 / reading → 阅读中 / done → 已完成
 * 空值或其他异常状态默认视为 待阅读。
 */
export function translateStatus(rawStatus: string | null | undefined): string {
  if (!rawStatus) return DEFAULT_STATUS;
  const normalized = rawStatus.trim().toLowerCase();
  // 尝试精确匹配
  if (STATUS_TRANSLATION[normalized]) {
    return STATUS_TRANSLATION[normalized];
  }
  // 尝试前缀匹配（兼容带前缀 / 或 # 的标签）
  for (const [key, value] of Object.entries(STATUS_TRANSLATION)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  return DEFAULT_STATUS;
}

// ═══════════════════════════════════════════════
// 步骤 3：动态双轨映射字典 (The Dual-Track Dictionary)
// ═══════════════════════════════════════════════

/**
 * 预读字典 (Pre-read)
 * 针对状态为"待阅读/阅读中"，上限 3 星
 */
export const PRE_READ_DICT: Record<number, string> = {
  1: '简单泛读',
  2: '值得关注',
  3: '重点精读',
};

/**
 * 已读字典 (Post-read)
 * 针对状态为"已完成"，支持 1-5 星
 */
export const POST_READ_DICT: Record<number, string> = {
  1: '知识储备',
  2: '可供参考',
  3: '值得借鉴',
  4: '高度相关',
  5: '关键研究',
};

// ═══════════════════════════════════════════════
// 步骤 4：状态感知与星标组装算法 (The Core Algorithm)
// ═══════════════════════════════════════════════

/** 双轨评价结果 */
export interface RatingResult {
  /** 修正后的评分 (1-5) */
  rating: number;
  /** 中文阅读状态 */
  statusText: string;
  /** 对应的语义评语 */
  comment: string;
  /** 5 字符星标串 */
  starString: string;
  /** 最终格式化输出 */
  formatted: string;
}

/**
 * 状态感知与星标组装核心算法。
 *
 * 结合文献的星标数字 rawRating 和中文化后的阅读状态 statusText，
 * 执行状态分支、评分拦截、动态填充与最终拼接。
 *
 * @param rawRating - Zotero 原始评星数 (1-5)
 * @param statusText - 中文化后的阅读状态 ("待阅读" | "阅读中" | "已完成")
 * @returns RatingResult - 包含修正评分、评语、星标串和格式化输出
 */
export function assembleRating(
  rawRating: number,
  statusText: string
): RatingResult {
  // 确保 rawRating 为正整数
  let clampedRating = Math.max(1, Math.round(rawRating));

  let comment: string;

  // ── 状态分支与评分拦截 ──
  if (statusText === '待阅读' || statusText === '阅读中') {
    // 预读轨：超过 3 分强制修正为 3
    if (clampedRating > 3) {
      clampedRating = 3;
    }
    comment = PRE_READ_DICT[clampedRating] || PRE_READ_DICT[1];
  } else {
    // 已完成轨 (statusText === '已完成')：保持 1-5
    // 兜底：未知状态也走已读轨
    comment = POST_READ_DICT[clampedRating] || POST_READ_DICT[1];
  }

  // ── 动态填充计算 ──
  const starString =
    STAR_FILLED.repeat(clampedRating) + STAR_HOLLOW.repeat(5 - clampedRating);

  // ── 最终拼接 ──
  const formatted = `${starString} (${comment})`;

  return {
    rating: clampedRating,
    statusText,
    comment,
    starString,
    formatted,
  };
}

/**
 * 从 Zotero 文献的标签数组中提取原始评星数。
 * 识别标签中的星标 emoji (⭐★🌟✨)，统计数量作为 rawRating。
 * 如果找不到星标标签则返回 0。
 */
export function extractRawRating(tags: any[]): number {
  if (!tags || !Array.isArray(tags)) return 0;

  let maxStars = 0;
  for (const t of tags) {
    const tag = (t.tag || t).toString();
    const starMatch = tag.match(/[⭐★🌟✨]/g);
    if (starMatch) {
      maxStars = Math.max(maxStars, starMatch.length);
    }
  }
  return maxStars;
}

/**
 * 从 Zotero 文献的标签数组中提取阅读状态。
 * 检测 /unread, /reading, /done 标记并翻译为中文。
 * 如果找不到状态标签则返回默认状态（待阅读）。
 */
export function extractStatusFromTags(tags: any[]): string {
  if (!tags || !Array.isArray(tags)) return DEFAULT_STATUS;

  const statusMarkers = ['/unread', '/reading', '/done'];
  for (const t of tags) {
    const tag = (t.tag || t).toString();
    for (const marker of statusMarkers) {
      if (tag.includes(marker)) {
        const rawStatus = marker.replace(/^\//, '');
        return translateStatus(rawStatus);
      }
    }
  }
  return DEFAULT_STATUS;
}

/**
 * 一站式处理：从 Zotero 文献项直接生成格式化评级字符串。
 *
 * @param item - Zotero 文献项（需包含 tags 数组）
 * @returns 格式化评级字符串，如 "★★☆☆☆ (值得关注)"；无星标时返回空字符串
 */
export function processItemRating(item: any): string {
  const rawRating = extractRawRating(item.tags);
  if (rawRating === 0) return '';

  const statusText = extractStatusFromTags(item.tags);
  const result = assembleRating(rawRating, statusText);
  return result.formatted;
}
