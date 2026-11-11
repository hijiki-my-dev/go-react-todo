function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

// 「今日」「昨日」「11月9日」のような日付の見出し
export function dayLabel(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (diffDays === 0) return '今日'
  if (diffDays === 1) return '昨日'
  const md = `${date.getMonth() + 1}月${date.getDate()}日`
  return date.getFullYear() === now.getFullYear() ? md : `${date.getFullYear()}年${md}`
}

export function timeLabel(iso: string): string {
  const date = new Date(iso)
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
}

// 日付ごとにまとめる（並び順はそのまま）
export function groupByDay<T>(items: T[], getDate: (item: T) => string): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = []
  for (const item of items) {
    const label = dayLabel(getDate(item))
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}
