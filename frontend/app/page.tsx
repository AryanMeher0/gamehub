import SocketStatus from "@/components/SocketStatus";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-950 text-white">
      <h1 className="text-5xl font-bold tracking-tight">GameHub</h1>
      <div className="flex gap-4">
        <button className="rounded-xl bg-indigo-600 px-6 py-3 text-lg font-semibold hover:bg-indigo-500">
          Create Room
        </button>
        <button className="rounded-xl bg-gray-700 px-6 py-3 text-lg font-semibold hover:bg-gray-600">
          Join Room
        </button>
      </div>
      <SocketStatus />
    </main>
  );
}
