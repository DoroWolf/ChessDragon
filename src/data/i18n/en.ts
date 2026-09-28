// UI English strings (AI dialogue is not localized, see src/data/dialogue/zh_cn.json)
import type { MessageKey } from './zh_cn'

const en: Record<MessageKey, string> = {
  // ---- Common ----
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.done': 'Done',

  // ---- Top bar ----
  'app.settings': 'Settings',

  // ---- Home ----
  'home.vsAI': 'Play Against AI',
  'home.vsHuman': 'Two Players',
  'home.remote': 'Remote Game',

  // ---- Game setup ----
  'setup.board': 'Board',
  'setup.boardStandard': 'Standard',
  'setup.boardChess960': 'Chess960',
  'setup.boardCustom': 'Custom',
  'setup.fenPlaceholder': 'Paste FEN here',
  'setup.invalidFen': 'Invalid FEN',
  'setup.clock': 'Clock',
  'setup.timeLimit': 'Time',
  'setup.unlimited': 'Unlimited',
  'setup.minutes': '{n} min',
  'setup.increment': 'Increment',
  'setup.seconds': '{n} s',
  'setup.strength': 'Strength',
  'setup.aiStyle': 'AI Style',
  'setup.styleBalanced': 'Balanced',
  'setup.styleAggressive': 'Aggressive',
  'setup.styleDefensive': 'Defensive',
  'setup.styleUnpredictable': 'Unpredictable',
  'setup.playAs': 'Play as',
  'setup.sideBlack': 'Black',
  'setup.sideRandom': 'Random',
  'setup.sideWhite': 'White',
  'setup.back': 'Back',
  'setup.start': 'Start Game',

  // ---- Sidebar ----
  'sidebar.flipBoard': 'Flip Board',
  'sidebar.turnToMove': '{side}\'s Turn',
  'sidebar.sideWhite': 'White',
  'sidebar.sideBlack': 'Black',
  'sidebar.home': 'Home',
  'sidebar.restart': 'Rematch',
  'sidebar.copyPgn': 'Copy PGN',
  'sidebar.undo': 'Undo',
  'sidebar.claimDraw': 'Claim Draw',
  'sidebar.offerDraw': 'Offer Draw',
  'sidebar.resign': 'Resign',
  'sidebar.confirmOfferDraw': 'Offer a draw?',
  'sidebar.confirmResign': 'Are you sure you want to resign?',
  'sidebar.confirmResignWithSide': 'Resign for {side}?',

  // ---- Game status ----
  'status.winByResign': '{side} wins (by resignation)',
  'status.winByTimeout': '{side} wins (on time)',
  'status.winByCheckmate': '{side} wins (by checkmate)',
  'status.draw': 'Draw',
  'status.sideWhite': 'White',
  'status.sideBlack': 'Black',

  // ---- Settings ----
  'settings.title': 'Game Settings',
  'settings.sound': 'Sound',
  'settings.boardLabels': 'Board Labels',
  'settings.labelsOff': 'Off',
  'settings.labelsInside': 'Inside',
  'settings.labelsOutside': 'Outside',
  'settings.theme': 'Theme',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.language': 'Language',
  'settings.langZh': '中文',
  'settings.langEn': 'English',
}

export default en
