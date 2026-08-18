"use client"

import { unstable_rethrow } from "next/navigation"
import { useState, type ComponentProps } from "react"

import { getImageUploadRejectedMessage } from "@/lib/common/app-error-messages"

type ImageUploadFormProps = Omit<ComponentProps<"form">, "action"> & {
  action: (formData: FormData) => Promise<void> | void
}

export async function runServerActionWithImageUploadGuard<T>(
  run: () => Promise<T>,
  onUploadRejected: (message: string) => T | Promise<T>,
) {
  try {
    return await run()
  } catch (error) {
    unstable_rethrow(error)
    const message = getImageUploadRejectedMessage(error)
    if (message) return onUploadRejected(message)
    throw error
  }
}

export function ImageUploadForm({ action, children, onSubmit, ...props }: ImageUploadFormProps) {
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      {...props}
      action={async (formData) => {
        setError(null)
        await runServerActionWithImageUploadGuard(
          async () => {
            await action(formData)
          },
          (message) => {
            setError(message)
          },
        )
      }}
      onSubmit={onSubmit}
    >
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      {children}
    </form>
  )
}
