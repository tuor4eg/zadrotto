"use client";

import { useState } from "react";
import { SearchableFranchiseSelect, type SearchableFranchiseOption } from "@/components/ui/searchable-franchise-select";

export function ChildPicker({ options }: { options: SearchableFranchiseOption[] }) {
  const [value, setValue] = useState("");
  return <SearchableFranchiseSelect id="child-id" name="childId" options={options} value={value} onChange={setValue} searchByTitleOnly />;
}
