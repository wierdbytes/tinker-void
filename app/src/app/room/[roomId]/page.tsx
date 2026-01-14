import { redirect } from 'next/navigation'

// Old room URL format removed - use /s/[secretId] instead
export default function RoomPage() {
  redirect('/')
}
