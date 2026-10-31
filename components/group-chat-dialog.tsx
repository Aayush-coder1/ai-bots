"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"

import { createGroupChat } from "@/actions/group-chat"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  type Bot,
  type InsertGroupChatInput,
  insertGroupChatSchema,
} from "@/db/schema"

const DEFAULTS: InsertGroupChatInput = { name: "", botIds: [] }

export function GroupChatDialog({
  bots,
  open,
  onOpenChange,
}: {
  bots: Bot[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InsertGroupChatInput>({
    resolver: zodResolver(insertGroupChatSchema),
    defaultValues: DEFAULTS,
  })

  const botIds = watch("botIds")

  // Every time the dialog opens it starts empty.
  useEffect(() => {
    if (open) {
      reset(DEFAULTS)
      setSubmitError(null)
    }
  }, [open, reset])

  function toggleBot(botId: string, checked: boolean) {
    const next = checked
      ? [...botIds, botId]
      : botIds.filter((id) => id !== botId)
    setValue("botIds", next, { shouldValidate: true, shouldDirty: true })
  }

  async function onSubmit(values: InsertGroupChatInput) {
    setSubmitError(null)
    try {
      const chat = await createGroupChat(values)
      onOpenChange(false)
      router.push(`/chats/${chat.id}`)
      router.refresh()
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Could not create the group"
      )
    }
  }

  const tooFewBots = bots.length < 2

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New group chat</DialogTitle>
            <DialogDescription>
              Name the group and pick which bots are in it.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="group-name">Name</FieldLabel>
              <Input
                id="group-name"
                placeholder="Weekend plans"
                autoComplete="off"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <FieldSet data-invalid={!!errors.botIds}>
              <FieldLegend variant="label">Bots</FieldLegend>
              {tooFewBots ? (
                <FieldDescription>
                  A group needs at least two bots. Create another bot first.
                </FieldDescription>
              ) : null}
              <FieldGroup className="max-h-64 gap-3 overflow-y-auto">
                {bots.map((bot) => {
                  const id = `group-bot-${bot.id}`
                  return (
                    <Field key={bot.id} orientation="horizontal">
                      <Checkbox
                        id={id}
                        checked={botIds.includes(bot.id)}
                        onCheckedChange={(checked) =>
                          toggleBot(bot.id, checked === true)
                        }
                        aria-invalid={!!errors.botIds}
                      />
                      <FieldLabel
                        htmlFor={id}
                        className="min-w-0 gap-3 font-normal"
                      >
                        <ChatAvatar
                          seed={bot.avatar}
                          className="size-7 shrink-0"
                        />
                        <span className="truncate">{bot.name}</span>
                      </FieldLabel>
                    </Field>
                  )
                })}
              </FieldGroup>
              <FieldError errors={[errors.botIds]} />
            </FieldSet>
          </FieldGroup>

          {submitError ? (
            <p className="text-sm text-destructive">{submitError}</p>
          ) : null}

          <DialogFooter>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                />
              }
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isSubmitting || tooFewBots}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
