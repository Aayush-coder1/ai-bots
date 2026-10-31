"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"

import { Trash2Icon } from "lucide-react"

import {
  createGroupChat,
  deleteGroupChat,
  updateGroupChat,
} from "@/actions/group-chat"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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

/** The group being edited: its id, name and current members. */
type EditableGroup = { id: string; name: string | null; bots: Bot[] }

function defaultsFor(group?: EditableGroup): InsertGroupChatInput {
  return group
    ? { name: group.name ?? "", botIds: group.bots.map((bot) => bot.id) }
    : { name: "", botIds: [] }
}

/**
 * Creates a group chat, or with `group` edits one: its name, who's in it,
 * or deleting it. `bots` is every bot the user has, to pick members from.
 */
export function GroupChatDialog({
  bots,
  group,
  open,
  onOpenChange,
}: {
  bots: Bot[]
  group?: EditableGroup
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const isEditing = !!group

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InsertGroupChatInput>({
    resolver: zodResolver(insertGroupChatSchema),
    defaultValues: defaultsFor(group),
  })

  const botIds = watch("botIds")

  // Every time the dialog opens it starts from the group's saved values, or
  // empty for a new group.
  useEffect(() => {
    if (open) {
      reset(defaultsFor(group))
      setSubmitError(null)
    }
  }, [open, group, reset])

  function toggleBot(botId: string, checked: boolean) {
    const next = checked
      ? [...botIds, botId]
      : botIds.filter((id) => id !== botId)
    setValue("botIds", next, { shouldValidate: true, shouldDirty: true })
  }

  async function onSubmit(values: InsertGroupChatInput) {
    setSubmitError(null)
    try {
      if (group) {
        await updateGroupChat(group.id, values)
        onOpenChange(false)
        router.refresh()
        return
      }

      const chat = await createGroupChat(values)
      onOpenChange(false)
      router.push(`/chats/${chat.id}`)
      router.refresh()
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Could not save the group"
      )
    }
  }

  async function handleDelete() {
    if (!group) {
      return
    }

    setIsDeleting(true)
    setDeleteError(null)

    try {
      await deleteGroupChat(group.id)
      setConfirmDelete(false)
      onOpenChange(false)
      router.push("/")
      router.refresh()
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete the group"
      )
    } finally {
      setIsDeleting(false)
    }
  }

  const tooFewBots = bots.length < 2

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[440px]">
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>
                {isEditing ? "Edit group chat" : "New group chat"}
              </DialogTitle>
              <DialogDescription>
                {isEditing
                  ? "Rename the group or change which bots are in it."
                  : "Name the group and pick which bots are in it."}
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
              {isEditing ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="sm:mr-auto"
                  disabled={isSubmitting || isDeleting}
                  onClick={() => {
                    setDeleteError(null)
                    setConfirmDelete(true)
                  }}
                >
                  <Trash2Icon data-icon="inline-start" />
                  Delete
                </Button>
              ) : null}
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
                {isEditing ? "Save changes" : "Create group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {group ? (
        <AlertDialog
          open={confirmDelete}
          onOpenChange={(next) => {
            if (isDeleting) {
              return
            }
            setConfirmDelete(next)
            if (!next) {
              setDeleteError(null)
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {group.name ?? "this group"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the group chat and its conversation for good. The
                bots in it stay. This can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError ? (
              <p className="text-sm text-destructive">{deleteError}</p>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isDeleting}
                onClick={handleDelete}
              >
                {isDeleting && <Spinner data-icon="inline-start" />}
                Delete group
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  )
}
