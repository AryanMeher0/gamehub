"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_TOKENS, generateEmojiToken, compressImage } from "@/lib/token";

interface Props {
  current: string | null;
  onSelect: (dataUrl: string) => void;
  onClose: () => void;
}

export default function TokenPicker({ current, onSelect, onClose }: Props) {
  const [preview, setPreview] = useState<string | null>(current);
  const [defaults, setDefaults] = useState<{ dataUrl: string; label: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const gen = DEFAULT_TOKENS.map((t) => ({
      dataUrl: generateEmojiToken(t.emoji),
      label: t.label,
    }));
    setDefaults(gen);
    if (!preview && gen.length > 0) setPreview(gen[0].dataUrl);
  }, []);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setProcessing(true);
    try {
      const dataUrl = await compressImage(file);
      setPreview(dataUrl);
    } finally {
      setProcessing(false);
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  function handleConfirm() {
    if (preview) onSelect(preview);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl fade-up"
        style={{ background: "radial-gradient(ellipse at 50% 0%, #1e2a4a 0%, #0c1228 100%)", border: "1px solid rgba(245,158,11,0.2)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <h2 className="text-base font-black text-white tracking-tight">Choose Your Token</h2>
            <p className="text-xs text-slate-500 mt-0.5">Your piece on the board</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none">✕</button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Preview */}
          <div className="flex items-center gap-4">
            <div
              className="h-16 w-16 rounded-xl overflow-hidden shrink-0 border-2"
              style={{ borderColor: preview ? "rgba(245,158,11,0.6)" : "rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)" }}
            >
              {preview ? (
                <img src={preview} alt="token preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600 text-2xl">?</div>
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-white">Your token</p>
              <p className="text-xs text-slate-500 mt-0.5">Pick a classic below or upload your own photo</p>
            </div>
          </div>

          {/* Default grid */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Classic Tokens</p>
            <div className="grid grid-cols-8 gap-1.5">
              {defaults.map(({ dataUrl, label }) => (
                <button
                  key={label}
                  title={label}
                  onClick={() => setPreview(dataUrl)}
                  className="rounded-lg overflow-hidden transition-all duration-150 hover:scale-110 active:scale-95"
                  style={{
                    outline: preview === dataUrl ? "2px solid rgba(245,158,11,0.8)" : "2px solid transparent",
                    outlineOffset: "2px",
                  }}
                >
                  <img src={dataUrl} alt={label} className="w-full aspect-square object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Upload area */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Custom Photo</p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-2xl flex flex-col items-center justify-center gap-2 py-5 transition-all duration-150"
              style={{
                border: `2px dashed ${dragging ? "rgba(245,158,11,0.7)" : "rgba(255,255,255,0.12)"}`,
                background: dragging ? "rgba(245,158,11,0.06)" : "rgba(0,0,0,0.2)",
              }}
            >
              {processing ? (
                <div className="text-amber-400 text-sm animate-pulse">Processing…</div>
              ) : (
                <>
                  <span className="text-2xl">{dragging ? "📂" : "📁"}</span>
                  <p className="text-xs text-slate-400 font-medium text-center">
                    Drag & drop an image here<br />
                    <span className="text-amber-400/70">or click to browse your files</span>
                  </p>
                  <p className="text-[10px] text-slate-600">JPG, PNG, GIF, WebP — auto-cropped to square</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {/* Confirm */}
          <button
            onClick={handleConfirm}
            disabled={!preview}
            className="w-full rounded-2xl py-3.5 text-sm font-black text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #d97706 0%, #b45309 100%)", boxShadow: "0 4px 20px rgba(217,119,6,0.35)" }}
          >
            Use This Token
          </button>
        </div>
      </div>
    </div>
  );
}
