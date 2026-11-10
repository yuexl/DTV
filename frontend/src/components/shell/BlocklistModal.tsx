import { Ban, X } from "lucide-react";
import { useState } from "react";
import { PLATFORM_LABEL } from "@/api";
import { SmoothImage } from "@/components/common/SmoothImage";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { useBlocklist, type BlockRecord } from "@/state/BlocklistProvider";
import { useToast } from "@/state/ToastProvider";
import styles from "./BlocklistModal.module.css";

/**
 * 跨平台统一的屏蔽名单管理。
 *
 * 所有平台的屏蔽项平铺在一个列表里（不分平台分组），在这里取消屏蔽后，
 * 视图层会立刻把主播卡片恢复出来（feed 缓存仍保留原始项）。
 */
export function BlocklistModal({ onClose }: { onClose: () => void }) {
  const { blocks, removeBlock, clearBlocks } = useBlocklist();
  const { toast } = useToast();
  const [confirmClear, setConfirmClear] = useState(false);

  const handleUnblock = (record: BlockRecord) => {
    removeBlock(record.platform, record.id);
    toast(`已取消屏蔽「${record.nickname}」`, "success");
  };

  return (
    <Modal
      title="屏蔽名单"
      onClose={onClose}
      width={480}
      footer={
        <>
          {blocks.length > 0 && (
            <button
              type="button"
              className={cn(styles.clearBtn, confirmClear && styles.clearBtnArmed)}
              onClick={() => {
                if (!confirmClear) {
                  setConfirmClear(true);
                  return;
                }
                clearBlocks();
                setConfirmClear(false);
                toast("已清空屏蔽名单", "success");
              }}
            >
              {confirmClear ? "确认清空？" : "清空全部"}
            </button>
          )}
          <button type="button" className={styles.doneBtn} onClick={onClose}>
            完成
          </button>
        </>
      }
    >
      <p className={styles.subtitle}>
        共 {blocks.length} 位 · 取消屏蔽后主播会重新出现在列表
      </p>

      {blocks.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <Ban size={24} strokeWidth={1.6} />
          </span>
          <p className={styles.emptyTitle}>还没有屏蔽任何主播</p>
          <p className={styles.emptyHint}>在首页卡片或播放页点击「屏蔽」即可加入这里</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {blocks.map((record) => (
            <li key={`${record.platform}:${record.id}`} className={styles.row}>
              <span className={styles.avatar}>
                <SmoothImage src={record.avatar} alt={record.nickname} rounded />
              </span>
              <span className={styles.meta}>
                <span className={styles.name} title={record.nickname}>
                  {record.nickname}
                </span>
                <span className={styles.sub}>
                  <span className={styles.platform}>
                    {PLATFORM_LABEL[record.platform]}
                  </span>
                  <span className={styles.roomId}>ID:{record.id}</span>
                </span>
              </span>
              <button
                type="button"
                className={styles.unblockBtn}
                onClick={() => handleUnblock(record)}
                aria-label={`取消屏蔽 ${record.nickname}`}
              >
                <X size={13} strokeWidth={2.4} />
                取消屏蔽
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
