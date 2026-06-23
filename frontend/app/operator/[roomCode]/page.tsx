"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { BoardSpace, GameState } from "@/types/game";

type Tab = "Players" | "Properties" | "Buildings" | "Cards" | "Debug";
type CardDeck = "chance" | "community";
type CardOption = { id: string; title: string; description: string };
type AccessPayload =
  | { authorized: false; message: string }
  | {
      authorized: true;
      state: GameState;
      board: BoardSpace[];
      cards: Record<CardDeck, CardOption[]>;
    };

const TABS: Tab[] = ["Players", "Properties", "Buildings", "Cards", "Debug"];

export default function OperatorPage() {
  const { roomCode: rawRoomCode } = useParams<{ roomCode: string }>();
  const roomCode = rawRoomCode.toUpperCase();
  const router = useRouter();
  const [access, setAccess] = useState<"checking" | "authorized" | "denied">("checking");
  const [denialMessage, setDenialMessage] = useState("Access Denied");
  const [state, setState] = useState<GameState | null>(null);
  const [board, setBoard] = useState<BoardSpace[]>([]);
  const [cards, setCards] = useState<Record<CardDeck, CardOption[]>>({
    chance: [],
    community: [],
  });
  const [tab, setTab] = useState<Tab>("Players");
  const [status, setStatus] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [cashAmount, setCashAmount] = useState(100);
  const [position, setPosition] = useState(0);
  const [propertyIndex, setPropertyIndex] = useState(1);
  const [cardPlayerId, setCardPlayerId] = useState("");
  const [deck, setDeck] = useState<CardDeck>("chance");
  const [cardId, setCardId] = useState("");
  const [die1, setDie1] = useState(1);
  const [die2, setDie2] = useState(1);

  useEffect(() => {
    const previousSocketId = sessionStorage.getItem(`gamehub:socket:${roomCode}`);
    const socket = getSocket();

    function requestAccess() {
      socket.emit("operator:getAccess", { roomCode });
    }

    function reclaimOrRequest() {
      if (previousSocketId && previousSocketId !== socket.id) {
        socket.emit("game:reconnect", { roomCode, oldSocketId: previousSocketId });
      } else {
        requestAccess();
      }
    }

    function onAccess(payload: AccessPayload) {
      if (!payload.authorized) {
        setDenialMessage(payload.message || "Access Denied");
        setAccess("denied");
        return;
      }
      setState(payload.state);
      setBoard(payload.board);
      setCards(payload.cards);
      setAccess("authorized");
      const firstPlayer = payload.state.turnOrder[0] ?? Object.keys(payload.state.players)[0] ?? "";
      setPlayerId((current) => current || firstPlayer);
      setCardPlayerId((current) => current || firstPlayer);
    }

    function onStateUpdated(updated: GameState) {
      setState(updated);
    }

    function onError(data: { message: string }) {
      if (data.message === "Access Denied") {
        setDenialMessage(data.message);
        setAccess("denied");
      } else {
        setStatus(`Error: ${data.message}`);
      }
    }

    function onResult(data: { message?: string }) {
      setStatus(data.message ?? "Operator action completed.");
    }

    function onReconnected() {
      if (socket.id) sessionStorage.setItem(`gamehub:socket:${roomCode}`, socket.id);
      requestAccess();
    }

    function onReconnectFailed() {
      requestAccess();
    }

    socket.on("connect", reclaimOrRequest);
    socket.on("operator:access", onAccess);
    socket.on("operator:error", onError);
    socket.on("operator:result", onResult);
    socket.on("game:stateUpdated", onStateUpdated);
    socket.on("game:reconnected", onReconnected);
    socket.on("game:reconnectFailed", onReconnectFailed);

    if (socket.connected) reclaimOrRequest();

    return () => {
      socket.off("connect", reclaimOrRequest);
      socket.off("operator:access", onAccess);
      socket.off("operator:error", onError);
      socket.off("operator:result", onResult);
      socket.off("game:stateUpdated", onStateUpdated);
      socket.off("game:reconnected", onReconnected);
      socket.off("game:reconnectFailed", onReconnectFailed);
    };
  }, [roomCode]);

  useEffect(() => {
    const options = cards[deck];
    if (!options.some((card) => card.id === cardId)) setCardId(options[0]?.id ?? "");
  }, [cards, deck, cardId]);

  const players = useMemo(() => (state ? Object.values(state.players) : []), [state]);
  const purchasableSpaces = useMemo(
    () => board.filter((space) => ["property", "railroad", "utility"].includes(space.type)),
    [board]
  );
  const ownedProperties = useMemo(
    () => (state ? Object.values(state.properties).sort((a, b) => a.spaceIndex - b.spaceIndex) : []),
    [state]
  );
  const streetProperties = ownedProperties.filter((property) => property.type === "property");

  function send(action: Record<string, unknown>) {
    setStatus("Applying operator action...");
    getSocket().emit("operator:action", { roomCode, action });
  }

  if (access === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="animate-pulse text-slate-400">Verifying host access...</p>
      </main>
    );
  }

  if (access === "denied" || !state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-red-800 bg-red-950/40 p-10 text-center shadow-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-red-400">Operator Panel</p>
          <h1 className="mt-4 text-4xl font-black">Access Denied</h1>
          <p className="mt-3 text-red-300">{denialMessage}</p>
          <button
            onClick={() => router.push(`/game/monopoly/${roomCode}`)}
            className="mt-8 rounded-xl bg-slate-800 px-5 py-3 font-bold hover:bg-slate-700"
          >
            Return to game
          </button>
        </div>
      </main>
    );
  }

  const currentPlayer = state.players[state.turnOrder[state.currentTurnIndex]];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-400">Host only</p>
            <h1 className="text-2xl font-black">Monopoly Operator Panel</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-800 px-3 py-1 font-mono text-sm">{roomCode}</span>
            <button
              onClick={() => router.push(`/game/monopoly/${roomCode}`)}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold hover:bg-slate-800"
            >
              Back to game
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-5">
        <div className="mb-5 flex gap-2 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 p-2">
          {TABS.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`min-w-fit rounded-xl px-5 py-3 text-sm font-bold transition ${
                tab === item ? "bg-amber-400 text-slate-950" : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {status && (
          <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            status.startsWith("Error")
              ? "border-red-800 bg-red-950/50 text-red-300"
              : "border-emerald-800 bg-emerald-950/50 text-emerald-300"
          }`}>
            {status}
          </div>
        )}

        {tab === "Players" && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Player controls">
              <Field label="Player">
                <PlayerSelect players={players} value={playerId} onChange={setPlayerId} />
              </Field>
              <Field label="Cash amount">
                <NumberInput value={cashAmount} onChange={setCashAmount} min={0} />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <ActionButton onClick={() => send({ type: "addCash", playerId, amount: cashAmount })}>Add cash</ActionButton>
                <ActionButton onClick={() => send({ type: "removeCash", playerId, amount: cashAmount })}>Remove cash</ActionButton>
                <ActionButton onClick={() => send({ type: "setCash", playerId, amount: cashAmount })}>Set cash</ActionButton>
              </div>
              <Field label="Move to board space">
                <select className={inputClass} value={position} onChange={(e) => setPosition(Number(e.target.value))}>
                  {board.map((space) => <option key={space.index} value={space.index}>{space.index}: {space.name}</option>)}
                </select>
              </Field>
              <ActionButton onClick={() => send({ type: "movePlayer", playerId, position })}>Move player</ActionButton>
              <div className="grid grid-cols-2 gap-2">
                <DangerButton onClick={() => send({ type: "sendToJail", playerId })}>Send to jail</DangerButton>
                <ActionButton onClick={() => send({ type: "releaseFromJail", playerId })}>Release from jail</ActionButton>
              </div>
            </Panel>

            <Panel title="Turn controls">
              <p className="rounded-xl bg-slate-950 p-3 text-sm text-slate-300">
                Current turn: <strong className="text-white">{currentPlayer?.name ?? "None"}</strong>
                <span className="ml-2 text-slate-500">({state.phase})</span>
              </p>
              <Field label="Change current turn">
                <PlayerSelect players={players} value={playerId} onChange={setPlayerId} />
              </Field>
              <ActionButton onClick={() => send({ type: "changeCurrentTurn", playerId })}>Change current turn</ActionButton>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Die 1">
                  <NumberInput value={die1} onChange={setDie1} min={1} max={6} />
                </Field>
                <Field label="Die 2">
                  <NumberInput value={die2} onChange={setDie2} min={1} max={6} />
                </Field>
              </div>
              <ActionButton onClick={() => send({ type: "forceDiceRoll", die1, die2 })}>Force dice roll</ActionButton>
              <DangerButton onClick={() => send({ type: "endTurn" })}>End turn now</DangerButton>
            </Panel>
          </div>
        )}

        {tab === "Properties" && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Give property">
              <Field label="Player">
                <PlayerSelect players={players} value={playerId} onChange={setPlayerId} />
              </Field>
              <Field label="Property">
                <PropertySelect spaces={purchasableSpaces} value={propertyIndex} onChange={setPropertyIndex} />
              </Field>
              <ActionButton onClick={() => send({ type: "giveProperty", playerId, spaceIndex: propertyIndex })}>
                Give property
              </ActionButton>
            </Panel>
            <Panel title="Owned properties">
              {ownedProperties.length === 0 && <p className="text-sm text-slate-500">No properties are owned.</p>}
              {ownedProperties.map((property) => (
                <div key={property.spaceIndex} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{property.name}</p>
                      <p className="text-xs text-slate-500">Owner: {state.players[property.ownerId]?.name ?? property.ownerId}</p>
                    </div>
                    <DangerButton onClick={() => send({ type: "removeProperty", spaceIndex: property.spaceIndex })}>
                      Remove
                    </DangerButton>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <PlayerSelect players={players} value={playerId} onChange={setPlayerId} />
                    </div>
                    <ActionButton onClick={() => send({
                      type: "changePropertyOwner", playerId, spaceIndex: property.spaceIndex,
                    })}>
                      Change owner
                    </ActionButton>
                  </div>
                </div>
              ))}
            </Panel>
          </div>
        )}

        {tab === "Buildings" && (
          <Panel title="Building controls">
            {streetProperties.length === 0 && (
              <p className="text-sm text-slate-500">Give a street property to a player before managing buildings.</p>
            )}
            {streetProperties.map((property) => (
              <div key={property.spaceIndex} className="grid items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-bold">{property.name}</p>
                  <p className="text-sm text-slate-500">
                    {state.players[property.ownerId]?.name} · {property.hasHotel ? "Hotel" : `${property.houseCount} house(s)`}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <ActionButton onClick={() => send({ type: "addHouse", spaceIndex: property.spaceIndex })}>+ House</ActionButton>
                  <DangerButton onClick={() => send({ type: "removeHouse", spaceIndex: property.spaceIndex })}>- House</DangerButton>
                  <ActionButton onClick={() => send({ type: "addHotel", spaceIndex: property.spaceIndex })}>+ Hotel</ActionButton>
                  <DangerButton onClick={() => send({ type: "removeHotel", spaceIndex: property.spaceIndex })}>- Hotel</DangerButton>
                </div>
              </div>
            ))}
          </Panel>
        )}

        {tab === "Cards" && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Force card">
              <Field label="Player">
                <PlayerSelect players={players} value={cardPlayerId} onChange={setCardPlayerId} />
              </Field>
              <Field label="Deck">
                <select className={inputClass} value={deck} onChange={(e) => setDeck(e.target.value as CardDeck)}>
                  <option value="chance">Chance</option>
                  <option value="community">Community Chest</option>
                </select>
              </Field>
              <Field label="Card">
                <select className={inputClass} value={cardId} onChange={(e) => setCardId(e.target.value)}>
                  {cards[deck].map((card) => <option key={card.id} value={card.id}>{card.title}</option>)}
                </select>
              </Field>
              <ActionButton onClick={() => send({ type: "forceCard", playerId: cardPlayerId, deck, cardId })}>
                Force {deck === "chance" ? "Chance" : "Community Chest"} card
              </ActionButton>
            </Panel>
            <Panel title="Get Out of Jail Free">
              <Field label="Player">
                <PlayerSelect players={players} value={cardPlayerId} onChange={setCardPlayerId} />
              </Field>
              <p className="text-sm text-slate-400">
                Current cards: {state.players[cardPlayerId]?.getOutOfJailFreeCards ?? 0}
              </p>
              <ActionButton onClick={() => send({ type: "giveGojf", playerId: cardPlayerId })}>
                Give GOJIF card
              </ActionButton>
            </Panel>
          </div>
        )}

        {tab === "Debug" && (
          <Panel title="Full game state JSON">
            <div className="flex justify-end">
              <button
                onClick={() => navigator.clipboard.writeText(JSON.stringify(state, null, 2))}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold hover:bg-slate-800"
              >
                Copy JSON
              </button>
            </div>
            <pre className="max-h-[70vh] overflow-auto rounded-xl bg-black p-4 text-xs leading-relaxed text-emerald-300">
              {JSON.stringify(state, null, 2)}
            </pre>
          </Panel>
        )}
      </div>
    </main>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
      <h2 className="text-lg font-black">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
      {label}
      {children}
    </label>
  );
}

function PlayerSelect({
  players,
  value,
  onChange,
}: {
  players: GameState["players"][string][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {players.map((player) => (
        <option key={player.id} value={player.id}>{player.name} (${player.cash})</option>
      ))}
    </select>
  );
}

function PropertySelect({
  spaces,
  value,
  onChange,
}: {
  spaces: BoardSpace[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {spaces.map((space) => <option key={space.index} value={space.index}>{space.index}: {space.name}</option>)}
    </select>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      className={inputClass}
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function ActionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl bg-amber-400 px-3 py-2.5 text-sm font-black text-slate-950 hover:bg-amber-300 active:scale-[0.98]">
      {children}
    </button>
  );
}

function DangerButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl bg-red-900 px-3 py-2.5 text-sm font-bold text-red-200 hover:bg-red-800 active:scale-[0.98]">
      {children}
    </button>
  );
}
