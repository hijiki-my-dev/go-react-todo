import { useEffect } from 'react'

type ConfirmDialogProps = {
  title: string
  message?: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

// 取り消せない操作の確認（PC: 中央のダイアログ / スマホ: 下からのシート）
function ConfirmDialog({ title, message = 'この操作は取り消せません。', confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center">
      <button type="button" aria-label="閉じる" onClick={onCancel} className="absolute inset-0 bg-slate-900/35" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative flex w-full flex-col gap-3 rounded-t-3xl bg-white px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+24px)] md:w-[380px] md:rounded-2xl md:p-5 md:shadow-xl"
      >
        <h2 id="confirm-title" className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-slate-500">{message}</p>
        <div className="mt-1 flex flex-col gap-2 md:flex-row-reverse">
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className="h-12 rounded-xl bg-red-600 px-4 text-[15px] font-semibold text-white hover:bg-red-700 md:h-9 md:rounded-lg md:text-sm"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-12 rounded-xl border border-slate-200 px-4 text-[15px] text-slate-700 hover:bg-slate-50 md:h-9 md:rounded-lg md:text-sm"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
