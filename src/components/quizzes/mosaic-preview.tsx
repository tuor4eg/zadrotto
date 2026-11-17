"use client";

import { useState } from "react";
import { MosaicCanvas } from "./mosaic-canvas";
import { Button } from "@/components/ui/button";
import { createMosaicState, transitionMosaic, MOSAIC_CELLS } from "@/lib/quizzes/mosaic";

export function MosaicPreview({ imageUrl, seed, budget, locked, onRegenerate }: {
  imageUrl: string;
  seed: number;
  budget: number;
  locked: boolean;
  onRegenerate: () => void;
}) {
  const [state, setState] = useState(() => createMosaicState(budget));
  const [testing, setTesting] = useState(false);
  return <div className="grid gap-3 rounded-md border border-stone-200 p-3">
    <p className="text-sm font-medium">{testing ? `Проверка игры · Осталось очков: ${state.remainingPoints}` : "Предпросмотр раскладки"}</p>
    <MosaicCanvas imageUrl={imageUrl} seed={seed} openedMask={testing ? state.openedMask : (1 << MOSAIC_CELLS) - 1} disabled={!testing || state.remainingPoints === 0}
      onOpen={(cellIndex) => setState((current) => transitionMosaic(current, { type: "openCell", cellIndex }).state)} />
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => { setState(createMosaicState(budget)); setTesting(!testing); }}>{testing ? "Сбросить проверку" : "Проверить игру"}</Button>
      <Button type="button" variant="outline" disabled={locked} onClick={onRegenerate}>Новая раскладка</Button>
    </div>
    <p className="text-xs text-stone-500">Проверка не влияет на участие игроков. Seed: {seed}. {locked ? "Раскладка зафиксирована." : "При первом включении раскладка и постер будут зафиксированы."}</p>
  </div>;
}
