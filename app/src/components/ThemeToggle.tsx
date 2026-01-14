'use client'

import { useEffect, useState } from 'react'
import { useTheme } from './ThemeProvider'
import { Sun, Moon, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Return a placeholder during SSR to prevent hydration mismatch
  if (!mounted) {
    return (
      <div
        className={cn(
          'flex items-center gap-1 p-1 rounded-full bg-surface-secondary/50 backdrop-blur-sm border border-border/50',
          className
        )}
      >
        <div className="p-2 rounded-full">
          <Sun className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="p-2 rounded-full">
          <Monitor className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="p-2 rounded-full">
          <Moon className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    )
  }

  return <ThemeToggleClient className={className} />
}

function ThemeToggleClient({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()

  return (
    <div
      className={cn(
        'flex items-center gap-1 p-1 rounded-full bg-surface-secondary/50 backdrop-blur-sm border border-border/50',
        className
      )}
    >
      <button
        onClick={() => setTheme('light')}
        className={cn(
          'relative p-2 rounded-full transition-all duration-300',
          theme === 'light'
            ? 'bg-white dark:bg-slate-700 text-amber-500 shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
        title="Светлая тема"
      >
        <Sun className="w-4 h-4" />
      </button>
      <button
        onClick={() => setTheme('system')}
        className={cn(
          'relative p-2 rounded-full transition-all duration-300',
          theme === 'system'
            ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
        title="Системная тема"
      >
        <Monitor className="w-4 h-4" />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={cn(
          'relative p-2 rounded-full transition-all duration-300',
          theme === 'dark'
            ? 'bg-white dark:bg-slate-700 text-indigo-400 shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
        title="Тёмная тема"
      >
        <Moon className="w-4 h-4" />
      </button>
    </div>
  )
}
