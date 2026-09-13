import type { Locale } from './locale'

/**
 * Copy the main process needs for the application menu and the native file
 * dialogs. The renderer owns the chosen locale and pushes it down over IPC; the
 * renderer's own, much larger dictionary lives in `renderer/src/lib/i18n.ts`.
 */

const EN = {
  'menu.file': 'File',
  'menu.edit': 'Edit',
  'menu.format': 'Format',
  'menu.view': 'View',
  'menu.window': 'Window',
  'menu.help': 'Help',
  'menu.new': 'New',
  'menu.open': 'Open…',
  'menu.save': 'Save',
  'menu.saveAs': 'Save As…',
  'menu.autoSave': 'Toggle Auto Save',
  'menu.exportPng': 'Export as PNG…',
  'menu.exportDocx': 'Export as Word…',
  'menu.find': 'Find',
  'menu.settings': 'Settings…',
  'menu.inlineCode': 'Inline Code',
  'menu.codeBlock': 'Code Block',
  'menu.outline': 'Outline',
  'menu.focus': 'Focus Mode',
  'menu.typewriter': 'Typewriter Mode',
  'menu.home': 'Welcome Page',
  'menu.sourceMode': 'Source Code Mode',
  'menu.about': 'About Type Editor',
  'dialog.openTitle': 'Open Markdown File',
  'dialog.saveTitle': 'Save',
  'dialog.saveAsTitle': 'Save As',
  'dialog.exportTitle': 'Export {label}',
  'dialog.untitled': 'Untitled',
  'dialog.imageTitle': 'Insert Image',
  'dialog.imageFilter': 'Images',
  'dialog.saveError': 'Could not save file',
  'dialog.openError': 'Could not open file',
  'dialog.exportError': 'Could not export file'
} as const

export type MainKey = keyof typeof EN

const ZH_CN: Record<MainKey, string> = {
  'menu.file': '文件',
  'menu.edit': '编辑',
  'menu.format': '格式',
  'menu.view': '视图',
  'menu.window': '窗口',
  'menu.help': '帮助',
  'menu.new': '新建',
  'menu.open': '打开…',
  'menu.save': '保存',
  'menu.saveAs': '另存为…',
  'menu.autoSave': '切换自动保存',
  'menu.exportPng': '导出为 PNG…',
  'menu.exportDocx': '导出为 Word…',
  'menu.find': '查找',
  'menu.settings': '设置…',
  'menu.inlineCode': '行内代码',
  'menu.codeBlock': '代码块',
  'menu.outline': '大纲',
  'menu.focus': '专注模式',
  'menu.typewriter': '打字机模式',
  'menu.home': '主页',
  'menu.sourceMode': '源码模式',
  'menu.about': '关于 Type Editor',
  'dialog.openTitle': '打开 Markdown 文件',
  'dialog.saveTitle': '保存',
  'dialog.saveAsTitle': '另存为',
  'dialog.exportTitle': '导出{label}',
  'dialog.untitled': '未命名',
  'dialog.imageTitle': '插入图片',
  'dialog.imageFilter': '图片',
  'dialog.saveError': '无法保存文件',
  'dialog.openError': '无法打开文件',
  'dialog.exportError': '无法导出文件'
}

const ZH_TW: Record<MainKey, string> = {
  'menu.file': '檔案',
  'menu.edit': '編輯',
  'menu.format': '格式',
  'menu.view': '檢視',
  'menu.window': '視窗',
  'menu.help': '說明',
  'menu.new': '新增',
  'menu.open': '開啟…',
  'menu.save': '儲存',
  'menu.saveAs': '另存新檔…',
  'menu.autoSave': '切換自動儲存',
  'menu.exportPng': '匯出為 PNG…',
  'menu.exportDocx': '匯出為 Word…',
  'menu.find': '尋找',
  'menu.settings': '設定…',
  'menu.inlineCode': '行內程式碼',
  'menu.codeBlock': '程式碼區塊',
  'menu.outline': '大綱',
  'menu.focus': '專注模式',
  'menu.typewriter': '打字機模式',
  'menu.home': '首頁',
  'menu.sourceMode': '原始碼模式',
  'menu.about': '關於 Type Editor',
  'dialog.openTitle': '開啟 Markdown 檔案',
  'dialog.saveTitle': '儲存',
  'dialog.saveAsTitle': '另存新檔',
  'dialog.exportTitle': '匯出{label}',
  'dialog.untitled': '未命名',
  'dialog.imageTitle': '插入圖片',
  'dialog.imageFilter': '圖片',
  'dialog.saveError': '無法儲存檔案',
  'dialog.openError': '無法開啟檔案',
  'dialog.exportError': '無法匯出檔案'
}

const JA: Record<MainKey, string> = {
  'menu.file': 'ファイル',
  'menu.edit': '編集',
  'menu.format': '書式',
  'menu.view': '表示',
  'menu.window': 'ウインドウ',
  'menu.help': 'ヘルプ',
  'menu.new': '新規',
  'menu.open': '開く…',
  'menu.save': '保存',
  'menu.saveAs': '名前を付けて保存…',
  'menu.autoSave': '自動保存の切り替え',
  'menu.exportPng': 'PNG として書き出す…',
  'menu.exportDocx': 'Word として書き出す…',
  'menu.find': '検索',
  'menu.settings': '設定…',
  'menu.inlineCode': 'インラインコード',
  'menu.codeBlock': 'コードブロック',
  'menu.outline': 'アウトライン',
  'menu.focus': 'フォーカスモード',
  'menu.typewriter': 'タイプライターモード',
  'menu.home': 'ホームページ',
  'menu.sourceMode': 'ソースコードモード',
  'menu.about': 'Type Editor について',
  'dialog.openTitle': 'Markdown ファイルを開く',
  'dialog.saveTitle': '保存',
  'dialog.saveAsTitle': '名前を付けて保存',
  'dialog.exportTitle': '{label}の書き出し',
  'dialog.untitled': '無題',
  'dialog.imageTitle': '画像を挿入',
  'dialog.imageFilter': '画像',
  'dialog.saveError': 'ファイルを保存できません',
  'dialog.openError': 'ファイルを開けません',
  'dialog.exportError': 'ファイルを書き出せません'
}

const TABLES: Record<Locale, Record<MainKey, string>> = {
  en: EN,
  'zh-CN': ZH_CN,
  'zh-TW': ZH_TW,
  ja: JA
}

export function mainStrings(locale: Locale): (key: MainKey, vars?: Record<string, string>) => string {
  const table = TABLES[locale] ?? EN
  return (key, vars) => {
    const template = table[key] ?? EN[key]
    if (!vars) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? vars[name] : match
    )
  }
}
