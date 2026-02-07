import React from 'react'
import { useI18n } from '../../i18n'
import type { Block } from '../../domain/types'

type Props = {
  side: 'left' | 'right'
  onFileSelect: (file: File) => void
  blocks: Block[]
  fileName: string | null
}

export default function FileUploadCard(props: Props) {
  const { side, onFileSelect, blocks, fileName } = props
  const { t } = useI18n()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0])
    }
  }

  return (
    <div className="file-upload-card" onClick={handleClick}>
      <input type="file" accept=".docx" ref={fileInputRef} style={{ display: 'none' }} onChange={handleChange} />
      <div className="upload-icon">{side === 'left' ? '📄' : '📝'}</div>
      <div className="upload-info">
        <h3>{side === 'left' ? t('upload.leftTitle') : t('upload.rightTitle')}</h3>
        <p className={fileName ? 'file-name' : 'placeholder'}>{fileName || t('upload.clickUpload')}</p>
        {blocks.length > 0 && <div className="status-badge">{t('upload.parsedBlocks', { count: blocks.length })}</div>}
      </div>
    </div>
  )
}

