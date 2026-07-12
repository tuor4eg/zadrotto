"use client";

import { useSyncExternalStore } from "react";

import { formatActivityLogDate } from "@/lib/activity-logs/model";

type ActivityLogTimeProps = {
  value: string;
};

function subscribe() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export function ActivityLogTime({ value }: ActivityLogTimeProps) {
  const isHydrated = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  return (
    <time dateTime={value}>
      {isHydrated ? formatActivityLogDate(value) : "—"}
    </time>
  );
}
