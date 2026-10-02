// 工具页均为独立 MPA 入口，一律在新窗口打开，避免打断当前对局进度。
export const TUTORIAL_PAGE = 'tutorial.html'

export const EDITOR_PAGE = 'editor.html'

export const MAIN_PAGE = 'index.html'

export const toolPageUrl = (page: string): string => `${import.meta.env.BASE_URL}${page}`

export const openToolTab = (page: string, search = ''): void => {
  window.open(`${toolPageUrl(page)}${search}`, '_blank')
}

export const encodeFenQuery = (fen: string): string => fen.replace(/ /g, '_')

export const decodeFenQuery = (value: string): string => value.replace(/_/g, ' ')

export const openToolWindow = (
  page: string,
  name: string,
  features = 'noopener,width=1024,height=860',
): void => {
  window.open(toolPageUrl(page), name, features)
}
