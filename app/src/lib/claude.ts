import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface DialogEntry {
  participantName: string
  text: string
  startTime: number
  endTime: number
}

export async function summarizeMeeting(
  dialog: DialogEntry[],
  meetingName?: string
): Promise<string> {
  // Format dialog for the prompt
  const formattedDialog = dialog
    .map((entry) => `[${formatTime(entry.startTime)}] ${entry.participantName}: ${entry.text}`)
    .join('\n')

  const prompt = `Ты — ассистент для создания резюме встреч. Проанализируй следующий диалог встречи и создай структурированное резюме на русском языке.

${meetingName ? `Название встречи: ${meetingName}\n` : ''}
Диалог встречи:
${formattedDialog}

Создай резюме встречи со следующей структурой:

## Краткое описание
[1-2 предложения о чём была встреча]

## Основные обсуждаемые темы
- [Тема 1]
- [Тема 2]
- ...

## Ключевые решения
- [Решение 1]
- [Решение 2]
- ...

## Задачи и следующие шаги
- [Задача 1] — [Ответственный, если указан]
- [Задача 2] — [Ответственный, если указан]
- ...

## Участники и их основной вклад
- [Имя участника]: [Краткое описание вклада]
- ...

Если какой-то раздел не применим (например, не было принято решений), напиши "Не обсуждалось" или пропусти раздел.`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  // Extract text from response
  const textBlock = message.content.find((block) => block.type === 'text')
  return textBlock?.text || 'Не удалось создать резюме'
}

export function formatDialog(dialog: DialogEntry[]): string {
  return dialog
    .sort((a, b) => a.startTime - b.startTime)
    .map((entry) => `[${formatTime(entry.startTime)}] ${entry.participantName}: ${entry.text}`)
    .join('\n\n')
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
