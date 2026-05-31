import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import type { getAuthorAccessProfiles } from "@/db/queries/author-access-profiles";
import { AdminToasts, type AdminToast } from "../admin-toasts";

type AuthorFormValues = {
  id?: number;
  code?: string;
  name?: string;
  isSystem?: boolean;
  accessProfileId?: number;
};

type AuthorFormProps = {
  action: (formData: FormData) => Promise<void>;
  accessProfiles: Awaited<ReturnType<typeof getAuthorAccessProfiles>>;
  errorMessage?: string | null;
  successMessage?: string | null;
  submitLabel: string;
  values?: AuthorFormValues;
};

export function AuthorForm({
  action,
  accessProfiles,
  errorMessage,
  successMessage,
  submitLabel,
  values,
}: AuthorFormProps) {
  const canChangeProfile = !values?.isSystem;
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];

  return (
    <form action={action} className="grid gap-5" noValidate>
      <AdminToasts clearParams={["error", "updated"]} messages={toastMessages} />

      {values?.id ? <input type="hidden" name="authorId" value={values.id} /> : null}
      {!canChangeProfile && values?.accessProfileId ? (
        <input type="hidden" name="accessProfileId" value={values.accessProfileId} />
      ) : null}

      <div className="grid gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="author-name">Имя</Label>
          <Input
            id="author-name"
            name="name"
            type="text"
            required
            defaultValue={values?.name ?? ""}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="author-access-profile">Профиль доступа</Label>
          <Select
            id="author-access-profile"
            name="accessProfileId"
            required
            defaultValue={values?.accessProfileId?.toString() ?? ""}
            disabled={!canChangeProfile}
          >
            <option value="">Выбери профиль</option>
            {accessProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Button type="submit">
          <Save />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
