"use client";

import { formatActivityLogDate } from "@/lib/activity-logs/model";

type ActivityLogTimeProps = {
  value: string;
};

export function ActivityLogTime({ value }: ActivityLogTimeProps) {
  return (
    <time dateTime={value} suppressHydrationWarning>
      {formatActivityLogDate(value)}
    </time>
  );
}
