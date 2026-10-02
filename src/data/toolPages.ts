// 工具页均为独立 MPA 入口，一律在新窗口打开，避免打断当前对局进度。
export const TUTORIAL_PAGE = 'tutorial.html'

export const EDITOR_PAGE = 'editor.html'

export const MAIN_PAGE = 'index.html'

export const toolPageUrl = (page: string): string => `${import.meta.env.BASE_URL}${page}`

// 目录与专题共用 tutorial.html，专题由查询参数定位
export const tutorialTopicUrl = (categoryId: string, topicId: string): string =>
  `${toolPageUrl(TUTORIAL_PAGE)}?category=${encodeURIComponent(categoryId)}&topic=${encodeURIComponent(topicId)}`

export const openToolTab = (page: string, search = ''): void => {
  window.open(`${toolPageUrl(page)}${search}`, '_blank')
}

export const encodeFenQuery = (fen: string): string => fen.replace(/ /g, '_')

export const decodeFenQuery = (value: string): string => value.replace(/_/g, ' ')
