'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ArchiveToasts, type ArchiveToast } from '@/components/ui/archive-toasts';

export function CopyTierLink({ publicId, title }: { publicId: string; title: string }) {
  const [messages, setMessages] = useState<ArchiveToast[]>([]);
  const [pending, setPending] = useState(false);

  async function share() {
    const url = new URL(`/tier-lists/${publicId}`, window.location.origin).href;
    setPending(true);
    try {
      if (window.matchMedia('(max-width: 767px), (pointer: coarse)').matches && navigator.share) {
        try {
          await navigator.share({ title, url });
          return;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(url);
      setMessages([{ id: `tier-share-${Date.now()}`, tone: 'success', text: 'Ссылка скопирована' }]);
    } catch {
      setMessages([{ id: `tier-share-${Date.now()}`, tone: 'error', text: 'Не удалось скопировать ссылку' }]);
    } finally {
      setPending(false);
    }
  }

  return <>
    <Button type="button" variant="outline" size="icon" disabled={pending} onClick={() => void share()} aria-label="Копировать ссылку или поделиться" className="shrink-0">
      <Share2 className="size-4" />
    </Button>
    <ArchiveToasts messages={messages} />
  </>;
}
