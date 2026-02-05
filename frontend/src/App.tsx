import React, { useState } from 'react'

// --- Interfaces ---

interface BlockMeta {
  headingLevel?: number
  pageNumber?: number
}

interface Block {
  blockId: string
  kind: string
  structurePath: string
  stableKey: string
  text: string
  htmlFragment: string
  meta: BlockMeta
}

interface AlignmentRow {
  rowId: string
  kind: 'matched' | 'inserted' | 'deleted' | 'changed'
  leftBlockId: string | null
  rightBlockId: string | null
  diffHtml?: string
  leftDiffHtml?: string
  rightDiffHtml?: string
}

// --- Component ---

function App() {
  const [leftFile, setLeftFile] = useState<File | null>(null)
  const [rightFile, setRightFile] = useState<File | null>(null)
  
  const [leftBlocks, setLeftBlocks] = useState<Block[]>([])
  const [rightBlocks, setRightBlocks] = useState<Block[]>([])
  
  const [diffRows, setDiffRows] = useState<AlignmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Helper to map blockId to Block object for rendering
  const getBlock = (blocks: Block[], id: string | null) => {
    if (!id) return null
    return blocks.find(b => b.blockId === id)
  }

  const handleFileChange = (side: 'left' | 'right') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (side === 'left') setLeftFile(file)
      else setRightFile(file)
      
      await parseFile(file, side)
    }
  }

  const parseFile = async (file: File, side: 'left' | 'right') => {
    setLoading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/parse', {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        throw new Error(`Failed to parse ${side} file: ${res.statusText}`)
      }

      const blocks: Block[] = await res.json()
      if (side === 'left') setLeftBlocks(blocks)
      else setRightBlocks(blocks)
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDiff = async () => {
    if (leftBlocks.length === 0 || rightBlocks.length === 0) {
      setError('Both files must be parsed first.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/diff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          left_blocks: leftBlocks,
          right_blocks: rightBlocks
        })
      })

      if (!res.ok) {
        throw new Error(`Diff failed: ${res.statusText}`)
      }

      const rows: AlignmentRow[] = await res.json()
      setDiffRows(rows)
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // --- Render Helpers ---

  // Custom renderer for block content to preserve styles
  const renderBlockContent = (html: string) => {
    return (
      <div 
        className="block-content"
        dangerouslySetInnerHTML={{ __html: html }} 
      />
    )
  }

  const FileUpload = ({ 
    side, 
    onFileSelect, 
    blocks,
    fileName 
  }: { 
    side: 'left' | 'right', 
    onFileSelect: (file: File) => void, 
    blocks: Block[],
    fileName: string | null
  }) => {
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
        <input 
          type="file" 
          accept=".docx" 
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleChange}
        />
        <div className="upload-icon">
          {side === 'left' ? '📄' : '📝'}
        </div>
        <div className="upload-info">
          <h3>{side === 'left' ? 'Original Document' : 'Revised Document'}</h3>
          <p className={fileName ? 'file-name' : 'placeholder'}>
            {fileName || 'Click to upload .docx'}
          </p>
          {blocks.length > 0 && (
            <div className="status-badge">
              ✓ {blocks.length} blocks parsed
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <style>{`
        :root{
          --bg: #0b1220;
          --panel: rgba(255,255,255,0.92);
          --panel-solid: #ffffff;
          --border: rgba(17,24,39,0.10);
          --text: #0f172a;
          --muted: rgba(15,23,42,0.62);
          --primary: #2563eb;
          --primary-pressed: #1d4ed8;
          --shadow: 0 10px 30px rgba(2, 6, 23, 0.08);
          --radius: 14px;
        }

        body {
          margin: 0;
          color: var(--text);
          background:
            radial-gradient(1200px 800px at 20% -10%, rgba(37,99,235,0.22), transparent 55%),
            radial-gradient(1000px 700px at 90% 0%, rgba(16,185,129,0.14), transparent 50%),
            #f5f7fb;
        }

        .app-container {
          max-width: 1600px;
          margin: 0 auto;
          padding: 28px 20px 40px;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 14px 16px;
          box-shadow: var(--shadow);
          backdrop-filter: blur(10px);
        }
        .header h1 {
          margin: 0;
          font-size: 18px;
          font-weight: 650;
          letter-spacing: 0.2px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .header-logo {
          background: linear-gradient(135deg, rgba(37,99,235,1), rgba(147,197,253,1));
          color: white;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          box-shadow: 0 8px 18px rgba(37,99,235,0.22);
        }
        
        .btn-primary {
          background: linear-gradient(180deg, rgba(37,99,235,1), rgba(29,78,216,1));
          color: white;
          border: 1px solid rgba(29,78,216,0.30);
          border-radius: 12px;
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 650;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
          box-shadow: 0 10px 18px rgba(37,99,235,0.20);
        }
        .btn-primary:hover { transform: translateY(-1px); filter: brightness(1.02); }
        .btn-primary:active { transform: translateY(0); background: var(--primary-pressed); box-shadow: 0 6px 12px rgba(37,99,235,0.18); }
        .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; transform: none; box-shadow: none; filter: none; }

        .upload-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin: 14px 0 18px;
        }
        .file-upload-card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
          box-shadow: 0 6px 18px rgba(2, 6, 23, 0.06);
        }
        .file-upload-card:hover { transform: translateY(-1px); border-color: rgba(37,99,235,0.35); box-shadow: 0 10px 24px rgba(2, 6, 23, 0.10); }
        .upload-icon { font-size: 28px; opacity: 0.9; }
        .upload-info h3 { margin: 0 0 4px 0; font-size: 14px; font-weight: 650; }
        .file-name { color: var(--primary); font-weight: 600; margin: 0; }
        .placeholder { color: var(--muted); margin: 0; }
        .status-badge { display: inline-block; margin-top: 8px; font-size: 12px; color: rgba(2, 122, 72, 1); background: rgba(16,185,129,0.14); padding: 3px 10px; border-radius: 999px; font-weight: 600; }

        .error-msg { padding: 12px 14px; background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.25); border-radius: var(--radius); color: rgba(153, 27, 27, 1); margin: 10px 0 18px; display: flex; align-items: center; gap: 8px; box-shadow: 0 6px 14px rgba(2, 6, 23, 0.05); }

        .diff-container {
          background: var(--panel-solid);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          overflow: auto;
          max-height: calc(100vh - 230px);
        }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        thead th {
          position: sticky;
          top: 0;
          z-index: 3;
          background: rgba(248, 250, 252, 0.92);
          backdrop-filter: blur(10px);
          color: var(--muted);
          font-weight: 650;
          font-size: 12px;
          padding: 12px 14px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        td {
          padding: 12px 14px;
          border-bottom: 1px solid rgba(15,23,42,0.06);
          vertical-align: top;
          font-size: 14px;
          line-height: 1.65;
          color: var(--text);
        }
        tbody tr:hover td { background: rgba(2, 6, 23, 0.02); }
        tr:last-child td { border-bottom: none; }
        
        .block-content { 
          white-space: pre-wrap;
          word-break: break-word;
        }
        .block-content p { margin: 0 0 8px 0; }
        .block-content p:last-child { margin-bottom: 0; }
        .block-content ul, .block-content ol { margin: 4px 0; padding-left: 24px; }
        .block-content li { margin-bottom: 4px; }
        
        .bg-inserted { background-color: rgba(16,185,129,0.06); }
        .bg-inserted .status-cell { color: rgba(2, 122, 72, 1); }
        .bg-deleted { background-color: rgba(239,68,68,0.06); }
        .bg-deleted .status-cell { color: rgba(185, 28, 28, 1); }
        .bg-changed { background-color: rgba(245, 158, 11, 0.06); }
        .bg-changed .status-cell { color: rgba(146, 64, 14, 1); }
        
        .row-id { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 12px; color: rgba(15,23,42,0.45); user-select: none; }
        .status-cell { text-align: center; font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 14px; user-select: none; }

        .aligned-lines { display: block; overflow: hidden; }
        .aligned-line { display: block; white-space: pre-wrap; word-break: break-word; }
        .aligned-line.empty { color: transparent; }
        .aligned-table { width: 200%; border-collapse: collapse; table-layout: fixed; transform: translateX(0); }
        .aligned-table.right-view { transform: translateX(-50%); }
        .aligned-table td { padding: 0; border: 0; vertical-align: top; }
        .aligned-table .aligned-col { width: 50%; }
        .aligned-cell-inner { width: 100%; white-space: pre-wrap; word-break: break-word; }
        .aligned-table.left-view td.right-col .aligned-cell-inner { visibility: hidden; }
        .aligned-table.right-view td.left-col .aligned-cell-inner { visibility: hidden; }
        
        .meta-info { display: none; }

        @media (max-width: 980px) {
          .upload-grid { grid-template-columns: 1fr; }
          .diff-container { max-height: none; }
        }
      `}</style>

      <div className="header">
        <h1>
          <div className="header-logo">D</div>
          DocComparison
        </h1>
        <button 
          className="btn-primary"
          onClick={handleDiff} 
          disabled={loading || leftBlocks.length === 0 || rightBlocks.length === 0}
        >
          {loading ? 'Processing...' : 'Compare Documents'}
        </button>
      </div>
      
      <div className="upload-grid">
        <FileUpload 
          side="left" 
          onFileSelect={(f) => { setLeftFile(f); parseFile(f, 'left'); }}
          blocks={leftBlocks}
          fileName={leftFile?.name || null}
        />
        <FileUpload 
          side="right" 
          onFileSelect={(f) => { setRightFile(f); parseFile(f, 'right'); }}
          blocks={rightBlocks}
          fileName={rightFile?.name || null}
        />
      </div>

      {error && (
        <div className="error-msg">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Diff Results Table */}
      {diffRows.length > 0 && (
        <div className="diff-container">
        <table>
          <colgroup>
            <col style={{ width: '60px' }} />
            <col style={{ width: '45%' }} />
            <col style={{ width: '40px' }} />
            <col style={{ width: '45%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>ID</th>
              <th>Original Content</th>
              <th></th>
              <th>Modified Content</th>
            </tr>
          </thead>
          <tbody>
            {diffRows.map((row) => {
              const leftBlock = getBlock(leftBlocks, row.leftBlockId)
              const rightBlock = getBlock(rightBlocks, row.rightBlockId)
              
              let rowClass = ''
              let icon = ''
              
              if (row.kind === 'inserted') { rowClass = 'bg-inserted'; icon = '+'; }
              else if (row.kind === 'deleted') { rowClass = 'bg-deleted'; icon = '-'; }
              else if (row.kind === 'changed') { rowClass = 'bg-changed'; icon = '•'; }
              
              return (
                <tr key={row.rowId} className={rowClass}>
                  <td className="row-id">#{row.rowId.split('_')[1]}</td>
                  
                  {/* Left Content */}
                  <td>
                    {leftBlock ? (
                      <div>
                        {row.kind === 'changed' && row.leftDiffHtml ? (
                          <div 
                            className="block-content"
                            dangerouslySetInnerHTML={{ __html: row.leftDiffHtml }} 
                          />
                        ) : (
                          renderBlockContent(leftBlock.htmlFragment)
                        )}
                      </div>
                    ) : null}
                  </td>
                  
                  {/* Status */}
                  <td className="status-cell">
                    {icon}
                  </td>

                  {/* Right Content */}
                  <td>
                    {rightBlock ? (
                      <div>
                        {/* If changed, show rightDiffHtml if available, else normal */}
                        {row.kind === 'changed' && row.rightDiffHtml ? (
                           <div 
                              className="block-content"
                              dangerouslySetInnerHTML={{ __html: row.rightDiffHtml }} 
                           />
                        ) : (
                           renderBlockContent(rightBlock ? rightBlock.htmlFragment : '')
                        )}
                      </div>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}

export default App
