import SocketStatus from "@/components/SocketStatus";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-950 text-white">
      <h1 className="text-5xl font-bold tracking-tight">GameHub</h1>
      <SocketStatus />
    </main>
  );
}
