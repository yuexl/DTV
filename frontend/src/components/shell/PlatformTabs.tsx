import { Tabs } from "@heroui/react";
import { Bookmark } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { PLATFORM_LABEL, PLATFORM_TAB_ORDER, type LivePlatform } from "@/api";
import { cn } from "@/lib/cn";
import { detectDesktopOS, isWailsRuntime } from "@/lib/window";
import styles from "./PlatformTabs.module.css";

/** 导航项：四个平台 + "订阅"。"订阅"不是平台，但和平台同级切换。 */
type TabId = LivePlatform | "subscribe";

const TABS: TabId[] = ["subscribe", ...PLATFORM_TAB_ORDER];

const TAB_PATH: Record<TabId, string> = {
  subscribe: "/subscribe",
  douyu: "/",
  huya: "/huya",
  douyin: "/douyin",
  bilibili: "/bilibili",
};

function activeTabFromPath(pathname: string, search: string): TabId {
  if (pathname.startsWith("/subscribe") || pathname.startsWith("/custom")) return "subscribe";
  // 播放页本身不属于任何平台：按 URL 里的 room 平台高亮对应的 tab
  if (pathname.startsWith("/player")) {
    const platform = new URLSearchParams(search).get("platform");
    if (platform && (PLATFORM_TAB_ORDER as readonly string[]).includes(platform)) {
      return platform as TabId;
    }
    return "douyu";
  }
  if (pathname.startsWith("/huya")) return "huya";
  if (pathname.startsWith("/douyin")) return "douyin";
  if (pathname.startsWith("/bilibili")) return "bilibili";
  return "douyu";
}

/**
 * 平台切换：HeroUI v3 Tabs 作为交互内核，视觉仍然是 Signal 的分段控件。
 *
 * 用 HeroUI 的 Tabs / List / Tab / Indicator 替换手写的滑块计算：
 * 选中项、键盘左右键、焦点管理交给 React Aria；我们只覆盖尺寸和配色。
 */
export function PlatformTabs() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const active = activeTabFromPath(pathname, search);

  const go = (next: TabId) => {
    if (!(next in TAB_PATH)) return;
    const target = TAB_PATH[next];
    // Linux 桌面端禁用 View Transitions：Wails v3 检测到 NVIDIA 显卡会在
    // application_linux.go 里自动设置 WEBKIT_DISABLE_DMABUF_RENDERER=1，
    // 使 WebKitGTK 6.0 的 AcceleratedBackingStore 为空；而 startViewTransition()
    // 会强制进入加速合成并解引用该空指针，导致 UI 进程 SIGSEGV（addr=0x48）。
    // 见 https://bugs.webkit.org/show_bug.cgi?id=324730 （2.48/2.50/2.52 系列）。
    // 等 WebKitGTK 修复后可以去掉这个判断；macOS / Windows 仍保留淡入。
    const skipViewTransition = isWailsRuntime() && detectDesktopOS() === "linux";
    // M-03：支持的运行时用 View Transitions 做 180ms 淡入；不支持直接切。
    const reduce =
      skipViewTransition || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const start = (
      document as Document & {
        startViewTransition?: (cb: () => void) => unknown;
      }
    ).startViewTransition;
    if (!reduce && typeof start === "function") {
      start.call(document, () => navigate(target));
      return;
    }
    navigate(target);
  };

  return (
    <Tabs
      selectedKey={active}
      onSelectionChange={(key) => go(String(key) as TabId)}
      className={cn(styles.tabs, styles.drag)}
    >
      <Tabs.ListContainer className={styles.track}>
        <Tabs.List className={styles.list} aria-label="内容切换">
          {TABS.map((tab) => (
            <Tabs.Tab
              key={tab}
              id={tab}
              className={cn(styles.tab, styles.noDrag)}
              aria-label={tab === "subscribe" ? "订阅分区" : `${PLATFORM_LABEL[tab]}直播`}
            >
              {tab === "subscribe" ? (
                <>
                  <Bookmark
                    size={14}
                    strokeWidth={2.2}
                    className={styles.tabIcon}
                  />
                  <span className="visually-hidden">订阅分区</span>
                </>
              ) : (
                PLATFORM_LABEL[tab]
              )}
              <Tabs.Indicator className={styles.indicator} />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}
