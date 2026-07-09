import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettings, setProfile } from '@/settings/store'

/** `/settings/profile` — a local display identity (never required). */
export default function ProfilePage() {
  const { profile } = useSettings()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          A local display identity. This does not create a server account and is never required.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Display name</Label>
          <Input
            id="name"
            value={profile.name}
            placeholder="Ada Lovelace"
            onChange={(e) => setProfile({ name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={profile.email}
            placeholder="ada@example.com"
            onChange={(e) => setProfile({ email: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
