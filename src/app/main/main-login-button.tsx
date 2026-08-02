"use client";

import { UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";

import { AuthorLoginModal } from "@/app/author/login/author-login-modal";

export function MainLoginButton() {
  const router = useRouter();
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="archive-control-surface inline-flex h-10 items-center justify-center rounded-md border border-stone-300/80 px-4 font-mono text-xs uppercase tracking-wider hover:border-stone-700"
        onClick={() => setIsLoginOpen(true)}
      >
        <UserCircle className="mr-2 size-4" />
        Войти
      </button>
      {isLoginOpen
        ? createPortal(
            <AuthorLoginModal
              onClose={() => setIsLoginOpen(false)}
              onSuccess={() => {
                setIsLoginOpen(false);
                router.refresh();
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
