"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, ShuffleIcon, Trash2Icon } from "lucide-react";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { createBot, deleteBot, updateBot } from "@/actions/bot";
import { ChatAvatar } from "@/components/chat-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { type Bot, type InsertBotInput, insertBotSchema } from "@/db/schema";

const BOT_PRESETS = [
  {
    job: "Research assistant",
    name: "Ada",
    instructions:
      "Answer briefly, cite sources, and ask before running anything destructive.",
  },
  {
    job: "Code reviewer",
    name: "Rex",
    instructions:
      "Review code carefully, explain bugs in plain language, and suggest tested fixes. Never approve broken code.",
  },
  {
    job: "Writing editor",
    name: "Wren",
    instructions:
      "Edit for clarity and tone, fix grammar, keep my voice, and show before/after for big changes.",
  },
  {
    job: "Tutor",
    name: "Tully",
    instructions:
      "Teach step by step, ask guiding questions, give concrete examples, and quiz me at the end.",
  },
] as const;

const NAME_SUGGESTIONS = BOT_PRESETS.map((p) => p.name);

const INSTRUCTION_SUGGESTIONS = [
  { label: "Brief + cited", value: BOT_PRESETS[0].instructions },
  { label: "Strict review", value: BOT_PRESETS[1].instructions },
  { label: "Keep my voice", value: BOT_PRESETS[2].instructions },
  { label: "Step-by-step", value: BOT_PRESETS[3].instructions },
] as const;

const DEFAULT_PRESET = BOT_PRESETS[0];

function createDefaults(): InsertBotInput {
  return {
    avatar: nanoid(),
    name: DEFAULT_PRESET.name,
    job: DEFAULT_PRESET.job,
    instructions: DEFAULT_PRESET.instructions,
  };
}

function botDefaults(bot: Bot): InsertBotInput {
  return {
    avatar: bot.avatar,
    name: bot.name,
    job: bot.job,
    instructions: bot.instructions ?? "",
  };
}

export function BotDialog({
  bot,
  open: openProp,
  onOpenChange,
  trigger,
}: {
  bot?: Bot | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
} = {}) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isEditing = !!bot;

  const form = useForm<InsertBotInput>({
    resolver: zodResolver(insertBotSchema),
    defaultValues: bot ? botDefaults(bot) : createDefaults(),
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  const avatar = watch("avatar");
  const job = watch("job");
  const name = watch("name");
  const instructions = watch("instructions");

  // Refresh the fields whenever the dialog opens so an edit always starts from
  // the bot's saved values and a create always starts from a fresh face.
  useEffect(() => {
    if (!open) {
      return;
    }

    reset(bot ? botDefaults(bot) : createDefaults());
  }, [open, bot, reset]);

  function handleShuffle() {
    setValue("avatar", nanoid(), { shouldValidate: true });
  }

  function applyPreset(preset: (typeof BOT_PRESETS)[number]) {
    setValue("job", preset.job, { shouldValidate: true, shouldDirty: true });
    setValue("name", preset.name, { shouldValidate: true, shouldDirty: true });
    setValue("instructions", preset.instructions, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  async function onSubmit(values: InsertBotInput) {
    if (bot) {
      await updateBot(bot.id, values);
    } else {
      await createBot(values);
    }

    setOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!bot) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteBot(bot.id);
      setConfirmDelete(false);
      setOpen(false);
      router.push("/");
      router.refresh();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete the bot"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      {trigger === undefined ? (
        <Button
          variant="secondary"
          className="rounded-full"
          onClick={() => setOpen(true)}
        >
          <PlusIcon data-icon="inline-start" />
          Create a new bot
        </Button>
      ) : (
        trigger
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>{isEditing ? "Edit bot" : "New bot"}</DialogTitle>
              <DialogDescription>
                {isEditing
                  ? "Change its face, its name, or what it does."
                  : "Give it a face, a name, and a job to do."}
              </DialogDescription>
            </DialogHeader>

            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={2}
              value={job ? [job] : []}
              onValueChange={(v) => {
                const next = BOT_PRESETS.find((p) => p.job === v[0]);
                if (next) {
                  applyPreset(next);
                }
              }}
              className="flex flex-wrap"
            >
              {BOT_PRESETS.map((preset) => (
                <ToggleGroupItem
                  key={preset.job}
                  value={preset.job}
                  className="rounded-full"
                >
                  {preset.job}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <FieldGroup>
              <Field>
                <div className="flex items-center gap-3">
                  <ChatAvatar seed={avatar} className="size-12 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-sm font-medium">Face</p>
                    <p className="text-sm text-muted-foreground">
                      Shuffle until you find one you like.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleShuffle}
                    className="shrink-0"
                  >
                    <ShuffleIcon data-icon="inline-start" />
                    Shuffle
                  </Button>
                </div>
              </Field>

              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="bot-name">Name</FieldLabel>
                <Input
                  id="bot-name"
                  placeholder="Ada"
                  autoComplete="off"
                  aria-invalid={!!errors.name}
                  {...register("name")}
                />
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  spacing={2}
                  value={name ? [name] : []}
                  onValueChange={(v) => {
                    if (v[0]) {
                      setValue("name", v[0], {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }
                  }}
                  className="flex flex-wrap"
                >
                  {NAME_SUGGESTIONS.map((suggestion) => (
                    <ToggleGroupItem
                      key={suggestion}
                      value={suggestion}
                      className="rounded-full"
                    >
                      {suggestion}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldError errors={[errors.name]} />
              </Field>

              <Field data-invalid={!!errors.job}>
                <FieldLabel htmlFor="bot-job">Job</FieldLabel>
                <Input
                  id="bot-job"
                  placeholder="Research assistant"
                  autoComplete="off"
                  aria-invalid={!!errors.job}
                  {...register("job")}
                />
                <FieldError errors={[errors.job]} />
              </Field>

              <Field data-invalid={!!errors.instructions}>
                <FieldLabel htmlFor="bot-instructions">
                  How it should work
                </FieldLabel>
                <Textarea
                  id="bot-instructions"
                  placeholder="Answer briefly, cite sources, and ask before running anything destructive."
                  rows={4}
                  aria-invalid={!!errors.instructions}
                  {...register("instructions")}
                />
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  spacing={2}
                  value={instructions ? [instructions] : []}
                  onValueChange={(v) => {
                    if (v[0]) {
                      setValue("instructions", v[0], {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }
                  }}
                  className="flex flex-wrap"
                >
                  {INSTRUCTION_SUGGESTIONS.map((suggestion) => (
                    <ToggleGroupItem
                      key={suggestion.label}
                      value={suggestion.value}
                      className="rounded-full"
                    >
                      {suggestion.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldError errors={[errors.instructions]} />
              </Field>
            </FieldGroup>

            <DialogFooter>
              {isEditing && (
                <Button
                  type="button"
                  variant="destructive"
                  className="sm:mr-auto"
                  disabled={isSubmitting || isDeleting}
                  onClick={() => {
                    setDeleteError(null);
                    setConfirmDelete(true);
                  }}
                >
                  <Trash2Icon data-icon="inline-start" />
                  Delete
                </Button>
              )}
              <DialogClose
                render={
                  <Button type="button" variant="outline" disabled={isSubmitting} />
                }
              >
                Cancel
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner data-icon="inline-start" />}
                {isEditing ? "Save changes" : "Create bot"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {bot && (
        <AlertDialog
          open={confirmDelete}
          onOpenChange={(next) => {
            if (isDeleting) {
              return;
            }

            setConfirmDelete(next);
            if (!next) {
              setDeleteError(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {bot.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the bot and its conversation for good. This
                can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError && (
              <p className="text-sm text-destructive">{deleteError}</p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isDeleting}
                onClick={handleDelete}
              >
                {isDeleting && <Spinner data-icon="inline-start" />}
                Delete bot
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
