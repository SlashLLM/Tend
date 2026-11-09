export default function NoAccess() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-4">
      <h1 className="text-2xl font-semibold">No access yet</h1>
      <p className="text-muted-foreground">Your account has no role in Tend. Please ask your Centre Leader or admin to invite you.</p>
      <form action="/auth/signout" method="post"><button className="min-h-11 text-primary underline">Sign out</button></form>
    </main>
  );
}
