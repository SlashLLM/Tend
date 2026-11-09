export function SetupNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">Tend is not connected yet</h1>
      <p className="text-muted-foreground">
        Set <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and{' '}
        <code>SUPABASE_SERVICE_ROLE_KEY</code> in <code>.env.local</code> (see <code>.env.example</code>), apply the migrations and seed,
        then reload.
      </p>
    </main>
  );
}
