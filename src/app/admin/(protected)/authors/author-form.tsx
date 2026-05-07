import { Save } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";

type AuthorFormValues = {
  id?: number;
  code?: string;
  name?: string;
};

type AuthorFormProps = {
  action: (formData: FormData) => Promise<void>;
  errorMessage?: string | null;
  successMessage?: string | null;
  submitLabel: string;
  values?: AuthorFormValues;
};

export function AuthorForm({
  action,
  errorMessage,
  successMessage,
  submitLabel,
  values,
}: AuthorFormProps) {
  return (
    <form action={action} className="grid gap-5">
      {values?.id ? <input type="hidden" name="authorId" value={values.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
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

        {values?.code ? <CodeDisplay code={values.code} /> : null}
      </div>

      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <div>
        <Button type="submit">
          <Save />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function CodeDisplay({ code }: { code: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium leading-none text-stone-700">Код</div>
      <div className="flex h-10 items-center rounded-md border border-stone-200 bg-stone-50 px-3 font-mono text-sm text-stone-500">
        {code}
      </div>
    </div>
  );
}
