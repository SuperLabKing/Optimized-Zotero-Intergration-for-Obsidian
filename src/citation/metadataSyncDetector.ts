/**
 * v6.5.0: Zotero 条目属性同步状态检测器
 *
 * 独立于 bibliographyWriter 的 bib dirty 检测，
 * 专门追踪 Zotero 条目的元数据（title/author/year 等）是否与 Obsidian 笔记
 * 上次同步后的状态一致。
 *
 * 状态变更通过回调列表通知 HUD icon 切换。
 */
import type { Events } from 'obsidian';

/** 当前文件的 Zotero 条目属性是否已过时（与上次同步后的状态不一致） */
export let isMetadataOutOfSync = false;

/** 上次成功同步时的 Zotero 元数据哈希缓存（key: filePath） */
export const metadataSyncHashCache = new Map<string, string>();

// ── 回调列表 ──

const dirtyCallbacks: Array<(dirty: boolean) => void> = [];

/** 注册 metadata dirty 状态变更回调。返回取消注册函数。 */
export function onMetadataDirtyChange(cb: (dirty: boolean) => void): () => void {
	dirtyCallbacks.push(cb);
	return () => {
		const idx = dirtyCallbacks.indexOf(cb);
		if (idx >= 0) dirtyCallbacks.splice(idx, 1);
	};
}

function setMetadataDirty(dirty: boolean) {
	if (isMetadataOutOfSync === dirty) return;
	isMetadataOutOfSync = dirty;
	for (const cb of dirtyCallbacks) {
		try { cb(dirty); } catch { /* 静默 */ }
	}
}

// ── 公开 API ──

/**
 * 同步完成后调用：记录本次同步的 Zotero 元数据哈希，清除 dirty 状态。
 * 可通过 emitter 触发 metadataClean 事件通知 UI 更新。
 */
export function markMetadataSynced(filePath: string, hash: string, emitter?: Events) {
	metadataSyncHashCache.set(filePath, hash);
	setMetadataDirty(false);
	try { emitter?.trigger('metadataClean'); } catch { /* 静默 */ }
}

/**
 * 检查当前 Zotero 元数据哈希是否与上次同步后的哈希一致。
 * 不一致 → 标记 dirty + 触发 metadataDirty 事件。
 * 一致 → 触发 metadataClean 事件（确保 UI 同步）。
 *
 * @param forceDirty 由调用方（silentDiffCheck）在已确认 Ob YAML ≠ Zotero 哈希时传入，
 *   绕过内部比对逻辑，直接置脏。用于首次开卷场景。
 */
export function checkMetadataDirty(
	filePath: string,
	currentHash: string,
	emitter?: Events,
	forceDirty?: boolean,
): boolean {
	if (forceDirty) {
		setMetadataDirty(true);
		try { emitter?.trigger('metadataDirty'); } catch { /* 静默 */ }
		return true;
	}
	const lastHash = metadataSyncHashCache.get(filePath);
	if (lastHash === undefined) {
		// 无缓存基线 → 保守标记 clean（调用方应通过 forceDirty 覆盖）
		setMetadataDirty(false);
		try { emitter?.trigger('metadataClean'); } catch { /* 静默 */ }
		return false;
	}
	const dirty = lastHash !== currentHash;
	setMetadataDirty(dirty);
	try {
		emitter?.trigger(dirty ? 'metadataDirty' : 'metadataClean');
	} catch { /* 静默 */ }
	return dirty;
}

/** 重置状态（跨文件切换时清理） */
export function resetMetadataState(emitter?: Events) {
	setMetadataDirty(false);
	try { emitter?.trigger('metadataClean'); } catch { /* 静默 */ }
}
