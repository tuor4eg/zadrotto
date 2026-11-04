"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getPersonalDataConsentRequirement } from "@/app/author/consent/actions";

/** Public document visibility uses the same server setting as account access. */
export function useConsentRequirement() {
  const pathname = usePathname();
  const [required, setRequired] = useState(false);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const refresh = () => {
      const requestGeneration = ++generation;
      void getPersonalDataConsentRequirement().then((value) => {
        if (active && requestGeneration === generation) setRequired(value);
      }).catch(() => { if (active && requestGeneration === generation) setRequired(false); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [pathname]);
  return required;
}
