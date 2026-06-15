import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">lineup</CardTitle>
          <CardDescription>Team training schedules, made simple.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            To register, use the join link your coach shared with you. If you've already joined,
            check the link your coach sent for your team's calendar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
