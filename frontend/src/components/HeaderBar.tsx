import React from 'react'
import { useI18n } from '../i18n'
import Toolbar from './Toolbar'

type Props = {
  theme: 'dark' | 'light'
  toggleTheme: () => void
  openRules: () => void
}

export default function HeaderBar(props: Props) {
  const { theme, toggleTheme, openRules } = props
  const { t } = useI18n()

  return (
    <div className="header">
      <h1>
        <div className="header-logo">D</div>
        {t('app.title')}
      </h1>
      <Toolbar theme={theme} toggleTheme={toggleTheme} openRules={openRules} />
    </div>
  )
}
