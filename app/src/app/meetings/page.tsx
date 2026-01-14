import { redirect } from 'next/navigation'

// Public meetings list removed - use /s/[secretId]/history instead
export default function MeetingsPage() {
  redirect('/')
}
