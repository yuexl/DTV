#!/bin/sh
# dtv-go 启动包装：绕过 Wails v3.0.0 在 NVIDIA/X11 上的 DMABUF 误判。
#
# Wails 的 application_linux.go init() 在 X11 会话里只要检测到 nvidia 模块，
# 就无条件 os.Setenv("WEBKIT_DISABLE_DMABUF_RENDERER", "1")。该值会让
# WebKitGTK 6.0 的 rendererBufferTransportMode() 提前返回（Hardware 和
# SharedMemory 都不添加），视频帧走异常回退路径 → 直播画面闪烁；并与 NVIDIA
# 的 EGL 显式同步冲突 → 独显启动时界面卡死。
#
# 预设 "0" 有两个作用：Wails 只在变量为空时才覆盖成 1（非空即跳过），
# 而 WebKitGTK 把 "0" 当作「不禁用」，于是回到正常 DMABUF 渲染路径。
# __NV_DISABLE_EXPLICIT_SYNC=1 是 Tauri 官方针对 NVIDIA 显式同步问题的首选建议，
# 不损失渲染性能。
#
# 用 ${VAR:-default} 保留用户从外部覆盖的能力（例如临时设 =1 恢复 Wails 行为）。
exec env \
  WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-0}" \
  __NV_DISABLE_EXPLICIT_SYNC="${__NV_DISABLE_EXPLICIT_SYNC:-1}" \
  /usr/lib/dtv-go/dtv-go "$@"
