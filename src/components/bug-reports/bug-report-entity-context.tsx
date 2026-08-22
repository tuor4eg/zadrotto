"use client";

import { useEffect } from "react";

import {
  useExternalInterface,
  type BugReportEntityContext,
} from "@/components/external-interface/external-interface-layer";

export function BugReportEntityContextRegistration({
  context,
}: {
  context: BugReportEntityContext;
}) {
  const { registerBugReportEntityContext } = useExternalInterface();

  useEffect(
    () => registerBugReportEntityContext({
      entityId: context.entityId,
      entityType: context.entityType,
    }),
    [context.entityId, context.entityType, registerBugReportEntityContext],
  );

  return null;
}
