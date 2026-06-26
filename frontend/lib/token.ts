const STORAGE_KEY = "gamehub:token";

export const DEFAULT_TOKENS = [
  { emoji: "🎩", label: "Top Hat" },
  { emoji: "🚂", label: "Train" },
  { emoji: "🐕", label: "Dog" },
  { emoji: "🚗", label: "Car" },
  { emoji: "⚓", label: "Anchor" },
  { emoji: "👢", label: "Boot" },
  { emoji: "💰", label: "Money" },
  { emoji: "👑", label: "Crown" },
  { emoji: "🦁", label: "Lion" },
  { emoji: "🦊", label: "Fox" },
  { emoji: "🎯", label: "Target" },
  { emoji: "💎", label: "Diamond" },
  { emoji: "⭐", label: "Star" },
  { emoji: "🔥", label: "Fire" },
  { emoji: "🚀", label: "Rocket" },
  { emoji: "🎲", label: "Dice" },
] as const;

export function generateEmojiToken(emoji: string, size = 80): string {
  if (typeof window === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#1e2a4a");
  gradient.addColorStop(1, "#0c1228");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.font = `${Math.round(size * 0.58)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
  return canvas.toDataURL("image/png");
}

export async function compressImage(file: File, size = 80): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.80));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function saveToken(dataUrl: string): void {
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, dataUrl);
}

export function loadToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}
