import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type Lang = 'en' | 'zh'

const translations: Record<Lang, Record<string, string>> = {
  en: {
    // Nav
    'nav.providers': 'Providers',
    'nav.credential-pool': 'Credential Pool',
    'nav.auxiliary': 'Auxiliary Models',
    'nav.env-provider': 'Provider Keys',
    'nav.env-tool': 'Tool Keys',
    'nav.env-messaging': 'Messaging Keys',
    'nav.model': 'Model',
    'nav.display': 'Display',
    'nav.agent': 'Agent',
    'nav.memory': 'Memory',
    'nav.compression': 'Compression',
    'nav.terminal': 'Terminal',
    'nav.browser': 'Browser',
    'nav.checkpoints': 'Checkpoints',
    'nav.tts': 'TTS',
    'nav.stt': 'STT',
    'nav.voice': 'Voice',
    'nav.approvals': 'Approvals',
    'nav.delegation': 'Delegation',
    'nav.smart_routing': 'Smart Routing',
    'nav.security': 'Security',
    'nav.privacy': 'Privacy',
    'nav.logging': 'Logging',
    'nav.network': 'Network',
    'nav.cron': 'Cron',
    'nav.human_delay': 'Human Delay',
    'nav.context': 'Context Engine',
    'nav.toolsets': 'Toolsets',
    // Shared
    'btn.save': 'Save',
    'btn.cancel': 'Cancel',
    'btn.reset': 'Reset',
    'btn.add': 'Add',
    'btn.edit': 'Edit',
    'btn.delete': 'Delete',
    'btn.switch': 'Switch',
    'btn.search': 'Search...',
    'msg.saved': 'Saved',
    'msg.error': 'Error',
    'msg.unsaved': 'unsaved change',
    'msg.unsaved_plural': 'unsaved changes',
    'msg.click_dismiss': 'click to dismiss',
    'msg.saving': 'Saving...',
    'msg.loading': 'Loading...',
    'msg.no_data': 'No data',
    'default': '(default)',
    'show': 'show',
    'hide': 'hide',
    // Provider panel
    'provider.title': 'Provider Management',
    'provider.active': 'Active',
    'provider.key_set': 'key set',
    'provider.no_key': 'no key',
    'provider.set_key_in': 'Set key in',
    // Credential pool
    'credpool.title': 'Credential Pool & Key Rotation',
    'credpool.credentials': 'credentials',
    'credpool.strategy': 'Strategy',
    'credpool.no_pools': 'No credential pools configured. Add keys via Provider Keys section.',
    'credpool.add_cred': '+ Add Credential',
    'credpool.label': 'Label',
    'credpool.api_key': 'API Key',
    'credpool.base_url': 'Base URL (optional)',
    'credpool.remove_confirm': 'Remove this credential?',
    // Auxiliary
    'aux.title': 'Auxiliary Models',
    'aux.subtitle': 'Separate provider/model for each side task',
    'aux.custom': 'custom',
    'aux.auto': 'auto',
    'aux.provider': 'Provider',
    'aux.model': 'Model',
    'aux.base_url': 'Base URL',
    'aux.api_key': 'API Key',
    'aux.timeout': 'Timeout (s)',
    'aux.empty_provider': 'Empty = provider default',
    'aux.direct_endpoint': 'Direct endpoint (overrides provider)',
    'aux.key_for_baseurl': 'Key for base_url',
    // Env keys
    'env.configured': 'configured',
    'env.empty': '(empty)',
    'env.enter_value': 'Enter value...',
    'env.get_key': 'Get Key ↗',
    // Schema panel
    'schema.reset_confirm': 'Reset "{section}" to defaults?',
    'schema.reset': 'Reset',
    // Reset section
    'reset.confirm': 'Reset "{section}" to defaults?',
  },
  zh: {
    // Nav
    'nav.providers': '供应商管理',
    'nav.credential-pool': '凭证池',
    'nav.auxiliary': '辅助模型',
    'nav.env-provider': '供应商密钥',
    'nav.env-tool': '工具密钥',
    'nav.env-messaging': '消息平台密钥',
    'nav.model': '模型',
    'nav.display': '显示',
    'nav.agent': 'Agent',
    'nav.memory': '记忆',
    'nav.compression': '压缩',
    'nav.terminal': '终端',
    'nav.browser': '浏览器',
    'nav.checkpoints': '检查点',
    'nav.tts': 'TTS 语音合成',
    'nav.stt': 'STT 语音识别',
    'nav.voice': '语音',
    'nav.approvals': '审批',
    'nav.delegation': '子代理委派',
    'nav.smart_routing': '智能路由',
    'nav.security': '安全',
    'nav.privacy': '隐私',
    'nav.logging': '日志',
    'nav.network': '网络',
    'nav.cron': '定时任务',
    'nav.human_delay': '拟人延迟',
    'nav.context': '上下文引擎',
    'nav.toolsets': '工具集',
    // Shared
    'btn.save': '保存',
    'btn.cancel': '取消',
    'btn.reset': '重置',
    'btn.add': '添加',
    'btn.edit': '编辑',
    'btn.delete': '删除',
    'btn.switch': '切换',
    'btn.search': '搜索...',
    'msg.saved': '已保存',
    'msg.error': '错误',
    'msg.unsaved': '个未保存更改',
    'msg.unsaved_plural': '个未保存更改',
    'msg.click_dismiss': '点击关闭',
    'msg.saving': '保存中...',
    'msg.loading': '加载中...',
    'msg.no_data': '暂无数据',
    'default': '(默认)',
    'show': '显示',
    'hide': '隐藏',
    // Provider panel
    'provider.title': '供应商管理',
    'provider.active': '当前',
    'provider.key_set': '已设密钥',
    'provider.no_key': '未设密钥',
    'provider.set_key_in': '在密钥管理中设置 →',
    // Credential pool
    'credpool.title': '凭证池 & 密钥轮换',
    'credpool.credentials': '个凭证',
    'credpool.strategy': '策略',
    'credpool.no_pools': '暂无凭证池。请在密钥管理中添加。',
    'credpool.add_cred': '+ 添加凭证',
    'credpool.label': '标签',
    'credpool.api_key': 'API 密钥',
    'credpool.base_url': '接口地址 (可选)',
    'credpool.remove_confirm': '确定删除此凭证？',
    // Auxiliary
    'aux.title': '辅助模型',
    'aux.subtitle': '为不同辅助任务配置独立的供应商/模型',
    'aux.custom': '自定义',
    'aux.auto': '自动',
    'aux.provider': '供应商',
    'aux.model': '模型',
    'aux.base_url': '接口地址',
    'aux.api_key': 'API 密钥',
    'aux.timeout': '超时 (秒)',
    'aux.empty_provider': '留空 = 使用默认供应商',
    'aux.direct_endpoint': '直连端点 (覆盖供应商)',
    'aux.key_for_baseurl': '接口地址对应的密钥',
    // Env keys
    'env.configured': '已配置',
    'env.empty': '(空)',
    'env.enter_value': '输入值...',
    'env.get_key': '获取密钥 ↗',
    // Schema panel
    'schema.reset_confirm': '重置 "{section}" 为默认值？',
    'schema.reset': '重置',
    // Reset section
    'reset.confirm': '重置 "{section}" 为默认值？',
  },
}

// ── Context ──────────────────────────────────────────────────────────────

interface I18nContextValue {
  lang: Lang
  t: (key: string, fallback?: string) => string
  setLang: (lang: Lang) => void
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  t: (k, fb) => fb || k,
  setLang: () => {},
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try { return (localStorage.getItem('hudui-lang') as Lang) || 'en' } catch { return 'en' }
  })

  const t = useCallback((key: string, fallback?: string) => {
    return translations[lang]?.[key] || translations.en?.[key] || fallback || key
  }, [lang])

  const handleSetLang = useCallback((l: Lang) => {
    setLang(l)
    try { localStorage.setItem('hudui-lang', l) } catch {}
  }, [])

  return (
    <I18nContext.Provider value={{ lang, t, setLang: handleSetLang }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}

export const LANG_LABELS: Record<Lang, string> = { en: 'English', zh: '中文' }
export type { Lang }
