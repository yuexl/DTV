import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { LIVE_PLATFORMS, type LivePlatform } from "@/api";
import { STORAGE_KEYS, usePersistentState } from "@/lib/storage";

/**
 * 屏蔽名单：被屏蔽的主播不再出现在首页 / 分区 / 订阅的主播卡片里。
 *
 * 数据只写本机 localStorage，不参与配置导出 / LAN 同步（新功能，保持最小）。
 * 过滤发生在视图层（StreamerGrid），feed 缓存里仍保留原始项，所以在这里
 * 取消屏蔽后卡片能立刻恢复，无需重新拉流。
 */

export interface BlockRecord {
  id: string;
  platform: LivePlatform;
  nickname: string;
  avatar: string;
  blockedAt: number;
}

/** 屏蔽一条只需要这些字段；网格传 Streamer，播放页用 StreamInfo 拼。 */
export interface BlockInput {
  platform: LivePlatform;
  id: string;
  nickname: string;
  avatar: string;
}

interface BlocklistContextValue {
  blocks: BlockRecord[];
  isBlocked: (platform: LivePlatform, id: string) => boolean;
  /** 返回「操作后是否被屏蔽」，供调用方决定 toast 文案 */
  toggleBlock: (input: BlockInput) => boolean;
  removeBlock: (platform: LivePlatform, id: string) => void;
  clearBlocks: () => void;
}

const BlocklistContext = createContext<BlocklistContextValue | null>(null);

function blockKey(platform: string, id: string): string {
  return `${platform}:${id}`;
}

function isPlatform(value: unknown): value is LivePlatform {
  return LIVE_PLATFORMS.includes(value as LivePlatform);
}

/** localStorage 是系统边界：过滤掉非法 / 重复项，避免脏数据带崩 UI。 */
function normalizeBlocks(raw: unknown): BlockRecord[] {
  const out: BlockRecord[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<BlockRecord>;
    const platform = record.platform;
    const id = String(record.id ?? "").trim();
    if (!isPlatform(platform) || !id) continue;
    const key = blockKey(platform, id);
    if (seen.has(key)) continue;
    seen.add(key);
    const blockedAt = Number(record.blockedAt);
    out.push({
      id,
      platform,
      nickname: String(record.nickname ?? "").trim() || id,
      avatar: String(record.avatar ?? ""),
      blockedAt: Number.isFinite(blockedAt) ? blockedAt : 0,
    });
  }
  return out;
}

export function BlocklistProvider({ children }: { children: ReactNode }) {
  const [rawBlocks, setRawBlocks] = usePersistentState<BlockRecord[]>(
    STORAGE_KEYS.blocklist,
    [],
  );

  const blocks = useMemo(() => normalizeBlocks(rawBlocks), [rawBlocks]);

  const blockedSet = useMemo(
    () => new Set(blocks.map((b) => blockKey(b.platform, b.id))),
    [blocks],
  );

  const isBlocked = useCallback(
    (platform: LivePlatform, id: string) => blockedSet.has(blockKey(platform, id)),
    [blockedSet],
  );

  const toggleBlock = useCallback(
    (input: BlockInput): boolean => {
      const key = blockKey(input.platform, input.id);
      const wasBlocked = blockedSet.has(key);
      setRawBlocks((prev) => {
        const list = normalizeBlocks(prev);
        if (wasBlocked) {
          return list.filter((b) => blockKey(b.platform, b.id) !== key);
        }
        return [
          {
            id: input.id,
            platform: input.platform,
            nickname: input.nickname || input.id,
            avatar: input.avatar,
            blockedAt: Date.now(),
          },
          ...list.filter((b) => blockKey(b.platform, b.id) !== key),
        ];
      });
      return !wasBlocked;
    },
    [blockedSet, setRawBlocks],
  );

  const removeBlock = useCallback(
    (platform: LivePlatform, id: string) => {
      const key = blockKey(platform, id);
      setRawBlocks((prev) =>
        normalizeBlocks(prev).filter((b) => blockKey(b.platform, b.id) !== key),
      );
    },
    [setRawBlocks],
  );

  const clearBlocks = useCallback(() => setRawBlocks([]), [setRawBlocks]);

  const value = useMemo<BlocklistContextValue>(
    () => ({ blocks, isBlocked, toggleBlock, removeBlock, clearBlocks }),
    [blocks, isBlocked, toggleBlock, removeBlock, clearBlocks],
  );

  return (
    <BlocklistContext.Provider value={value}>{children}</BlocklistContext.Provider>
  );
}

export function useBlocklist() {
  const ctx = useContext(BlocklistContext);
  if (!ctx) throw new Error("useBlocklist 必须在 BlocklistProvider 内使用");
  return ctx;
}
