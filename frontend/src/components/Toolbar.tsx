import React from 'react'
import { useI18n, type Lang } from '../i18n'

type Props = {
  theme: 'dark' | 'light'
  toggleTheme: () => void
  openRules: () => void
}

export default function Toolbar(props: Props) {
  const { theme, toggleTheme, openRules } = props
  const { lang, setLang, t } = useI18n()

  const nextLang: Lang = lang === 'zh-CN' ? 'en-US' : 'zh-CN'

  return (
    <div className="toolbar">
      <button
        className="btn-secondary"
        onClick={toggleTheme}
        title={theme === 'dark' ? t('toolbar.theme.toLight') : t('toolbar.theme.toDark')}
      >
        {theme === 'dark' ? t('toolbar.theme.light') : t('toolbar.theme.dark')}
      </button>
      <button
        className="btn-secondary"
        onClick={() => setLang(nextLang)}
        title={t('toolbar.lang.switchTitle')}
        style={{ height: 34, padding: '0 10px' }}
      >
        🌐
      </button>
      <button
        className="btn-secondary"
        onClick={openRules}
      >
        {t('toolbar.configRules')}
      </button>
    </div>
  )
}
