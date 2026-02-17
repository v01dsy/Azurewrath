'use client'

import { useEffect, useState } from 'react'

export function LocalTime({ date }: { date: string }) {
  const [formatted, setFormatted] = useState<string>('')

  useEffect(() => {
    setFormatted(new Date(date).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }))
  }, [date])

  return <>{formatted}</>
}