// 界面简体中文文案（AI 对话不在此处，见 src/data/dialogue/zh_cn.json）
const zhCN = {
  // ---- 通用 ----
  'common.cancel': '取消',
  'common.confirm': '确认',
  'common.done': '完成',

  // ---- 顶栏 ----
  'app.settings': '设置',

  // ---- 首页 ----
  'home.vsAI': '人机对局',
  'home.vsHuman': '双人对局',
  'home.remote': '远程对局',

  // ---- 对局设置 ----
  'setup.board': '棋盘',
  'setup.boardStandard': '标准棋盘',
  'setup.boardChess960': 'Chess960',
  'setup.boardCustom': '自定义棋盘',
  'setup.fenPlaceholder': '在此处粘贴 FEN 文本',
  'setup.invalidFen': '无效的 FEN',
  'setup.fenKingCount': '不合法的局面：必须各有一枚白王与黑王',
  'setup.fenPawnRank': '不合法的局面：兵不能停留在自己的底线上',
  'setup.fenPieceCount': '不合法的局面：同一方的棋子数量超出上限',
  'setup.fenIllegalCheck': '不合法的局面：非走棋方被将军，该方的王会被直接吃掉',
  'setup.fenCheckmate': '不合法的局面：走棋方已被将死',
  'setup.fenStalemate': '不合法的局面：走棋方已无子可走（逼和）',
  'setup.fenInsufficientMaterial': '不合法的局面：子力不足，无法分出胜负',
  'setup.clock': '棋钟',
  'setup.timeLimit': '限时',
  'setup.unlimited': '无限制',
  'setup.minutes': '{n} 分钟',
  'setup.increment': '每步加时',
  'setup.seconds': '{n} 秒',
  'setup.strength': '强度',
  'setup.aiStyle': 'AI 风格',
  'setup.styleBalanced': '均衡',
  'setup.styleAggressive': '进攻',
  'setup.styleDefensive': '防守',
  'setup.styleUnpredictable': '出其不意',
  'setup.playAs': '执棋方',
  'setup.sideBlack': '黑方',
  'setup.sideRandom': '随机',
  'setup.sideWhite': '白方',
  'setup.back': '返回',
  'setup.start': '开始对局',

  // ---- 侧边栏 ----
  'sidebar.flipBoard': '翻转棋盘',
  'sidebar.turnToMove': '{side}执子',
  'sidebar.sideWhite': '白方',
  'sidebar.sideBlack': '黑方',
  'sidebar.home': '返回',
  'sidebar.restart': '重赛',
  'sidebar.copyPgn': '复制 PGN',
  'sidebar.undo': '悔棋',
  'sidebar.claimDraw': '宣告和棋',
  'sidebar.offerDraw': '提议和棋',
  'sidebar.resign': '认输',
  'sidebar.confirmOfferDraw': '确定要提议和棋吗？',
  'sidebar.confirmResign': '确定要认输吗？',
  'sidebar.confirmResignWithSide': '确定要让{side}认输吗？',

  // ---- 对局状态 ----
  'status.winByResign': '{side}胜利（对手认输）',
  'status.winByTimeout': '{side}胜利（超时）',
  'status.winByCheckmate': '{side}胜利（将死）',
  'status.draw': '和棋',
  'status.sideWhite': '白方',
  'status.sideBlack': '黑方',

  // ---- 设置 ----
  'settings.title': '游戏设置',
  'settings.sound': '音效',
  'settings.boardLabels': '棋盘标志',
  'settings.labelsOff': '关闭',
  'settings.labelsInside': '内侧',
  'settings.labelsOutside': '外侧',
  'settings.theme': '主题',
  'settings.themeLight': '浅色',
  'settings.themeDark': '深色',
  'settings.language': '语言',
  'settings.langZh': '中文',
  'settings.langEn': 'English',
}

export type MessageKey = keyof typeof zhCN
export default zhCN
