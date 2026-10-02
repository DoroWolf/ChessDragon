// ============================================================
// 辅助工具页面（帮助 / 棋盘编辑器）
//   均为独立的 MPA 入口，一律在新窗口打开，避免打断当前对局进度。
// ============================================================

/** 帮助页入口文件名（位于构建产物的站点根目录） */
export const TUTORIAL_PAGE = 'tutorial.html'

/** 棋盘编辑器入口文件名 */
export const EDITOR_PAGE = 'editor.html'

/** 主程序入口文件名 */
export const MAIN_PAGE = 'index.html'

/**
 * 生成工具页的绝对路径。
 * 用 import.meta.env.BASE_URL 兼容 dev（'/'）与 GitHub Pages（'/ChessDragon/'）。
 */
export const toolPageUrl = (page: string): string => `${import.meta.env.BASE_URL}${page}`

/**
 * 在新标签页打开工具页。
 * 不传 window features，因此是普通标签页：保留地址栏、前进后退与刷新，
 * 编辑地址栏里的 URL 也能正常生效。
 * search 为可选的查询字符串（以 ? 开头），例如携带局面的 `?fen=...`。
 */
export const openToolTab = (page: string, search = ''): void => {
  window.open(`${toolPageUrl(page)}${search}`, '_blank')
}

/** FEN 写入 URL 查询参数时的编码：用下划线代替空格，避免地址栏出现 '+' */
export const encodeFenQuery = (fen: string): string => fen.replace(/ /g, '_')

/** 读取 URL 查询参数里的 FEN 时解码：把下划线还原成空格 */
export const decodeFenQuery = (value: string): string => value.replace(/_/g, ' ')

/**
 * 在新窗口打开工具页（受控尺寸的弹出窗口）。
 * 固定 window name，重复点击会复用同一个窗口而不是越开越多。
 */
export const openToolWindow = (
  page: string,
  name: string,
  features = 'noopener,width=1024,height=860',
): void => {
  window.open(toolPageUrl(page), name, features)
}
