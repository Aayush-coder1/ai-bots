"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useForm, useWatch } from "react-hook-form"

import { createAutomation } from "@/actions/automation"
import { Button } from "@/components/ui/button"
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
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  type AutomationFrequency,
  type InsertAutomationInput,
  insertAutomationSchema,
} from "@/db/schema"
import { useBillingGate } from "@/hooks/use-billing-gate"
import {
  AUTOMATION_TEMPLATES,
  type AutomationTemplate,
} from "@/lib/automation-templates"
import { DAY_NAMES } from "@/lib/schedule"

export type AutomationBot = { id: string; name: string; avatar: string }
export type AutomationDevice = { id: string; name: string; online: boolean }

const FREQUENCIES: { value: AutomationFrequency; label: string }[] = [
  { value: "hourly", label: "Every hour" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
]

function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

function defaultsFor(bots: AutomationBot[]): InsertAutomationInput {
  const template = AUTOMATION_TEMPLATES[0]
  return {
    botId: bots[0]?.id ?? "",
    name: template.name,
    prompt: template.prompt,
    frequency: template.frequency,
    time: template.time,
    dayOfWeek: 1,
    timezone: localTimeZone(),
    deviceId: "",
    webhookUrl: "",
  }
}

export function AutomationDialog({
  bots,
  devices,
  open,
  onOpenChange,
}: {
  bots: AutomationBot[]
  devices: AutomationDevice[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { paywall } = useBillingGate()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InsertAutomationInput>({
    resolver: zodResolver(insertAutomationSchema),
    defaultValues: defaultsFor(bots),
  })

  const name = useWatch({ control, name: "name" })
  const frequency = useWatch({ control, name: "frequency" })
  const dayOfWeek = useWatch({ control, name: "dayOfWeek" })
  const timezone = useWatch({ control, name: "timezone" })
  const deviceId = useWatch({ control, name: "deviceId" })

  // A reopened dialog shows no error from last time. Done while rendering,
  // the way React recommends adjusting state when a prop changes.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSubmitError(null)
    }
  }

  // Every time the dialog opens it starts fresh, in the browser's time zone.
  useEffect(() => {
    if (open) {
      reset(defaultsFor(bots))
    }
  }, [open, bots, reset])

  // One object applied atomically, so picking a template fills every field.
  function applyTemplate(template: AutomationTemplate) {
    const options = { shouldValidate: true, shouldDirty: true }
    setValue("name", template.name, options)
    setValue("prompt", template.prompt, options)
    setValue("frequency", template.frequency, options)
    setValue("time", template.time, options)
    // A task for the user's own device runs on the first one they connected;
    // any other template goes back to the bot's cloud computer.
    setValue(
      "deviceId",
      template.needsPc ? (devices[0]?.id ?? "") : "",
      options
    )
  }

  async function onSubmit(values: InsertAutomationInput) {
    setSubmitError(null)
    try {
      const result = await createAutomation(values)
      if (result.ok) {
        onOpenChange(false)
        router.refresh()
        return
      }
      if (result.reason === "upgrade-required") {
        // Close first so the toast isn't left behind the dialog's backdrop.
        onOpenChange(false)
        paywall("Automations are part of the paid plan.")
        return
      }
      setSubmitError(result.message)
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Could not save the automation"
      )
    }
  }

  const noBots = bots.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-[520px]">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New automation</DialogTitle>
            <DialogDescription>
              A task one of your bots does on a schedule, without you asking.
            </DialogDescription>
          </DialogHeader>

          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={2}
            value={name ? [name] : []}
            onValueChange={(v) => {
              const next = AUTOMATION_TEMPLATES.find((t) => t.name === v[0])
              if (next) {
                applyTemplate(next)
              }
            }}
            className="flex flex-wrap"
          >
            {AUTOMATION_TEMPLATES.map((template) => (
              <ToggleGroupItem
                key={template.name}
                value={template.name}
                className="rounded-full"
              >
                {template.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <FieldGroup>
            <Field data-invalid={!!errors.botId}>
              <FieldLabel htmlFor="automation-bot">Bot</FieldLabel>
              <NativeSelect
                id="automation-bot"
                className="w-full"
                aria-invalid={!!errors.botId}
                disabled={noBots}
                {...register("botId")}
              >
                {bots.map((bot) => (
                  <NativeSelectOption key={bot.id} value={bot.id}>
                    {bot.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {noBots ? (
                <FieldDescription>
                  Create a bot first: an automation needs one to do the work.
                </FieldDescription>
              ) : null}
              <FieldError errors={[errors.botId]} />
            </Field>

            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="automation-name">Name</FieldLabel>
              <Input
                id="automation-name"
                autoComplete="off"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={!!errors.prompt}>
              <FieldLabel htmlFor="automation-prompt">Task</FieldLabel>
              <Textarea
                id="automation-prompt"
                rows={5}
                aria-invalid={!!errors.prompt}
                {...register("prompt")}
              />
              <FieldDescription>
                Replace anything in [BRACKETS]. Say exactly what you want back;
                the bot can&apos;t ask you questions while it runs.
              </FieldDescription>
              <FieldError errors={[errors.prompt]} />
            </Field>

            <Field>
              <FieldLabel>How often</FieldLabel>
              <ToggleGroup
                variant="outline"
                size="sm"
                spacing={2}
                value={[frequency]}
                onValueChange={(v) => {
                  const next = FREQUENCIES.find((f) => f.value === v[0])
                  if (next) {
                    setValue("frequency", next.value, { shouldDirty: true })
                  }
                }}
                className="flex flex-wrap"
              >
                {FREQUENCIES.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className="rounded-full"
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <div className="flex flex-wrap gap-4">
              {frequency === "weekly" ? (
                <Field className="min-w-36 flex-1">
                  <FieldLabel htmlFor="automation-day">Day</FieldLabel>
                  <NativeSelect
                    id="automation-day"
                    className="w-full"
                    value={String(dayOfWeek)}
                    onChange={(event) =>
                      setValue("dayOfWeek", Number(event.target.value), {
                        shouldDirty: true,
                      })
                    }
                  >
                    {DAY_NAMES.map((day, index) => (
                      <NativeSelectOption key={day} value={String(index)}>
                        {day}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}
              <Field data-invalid={!!errors.time} className="min-w-36 flex-1">
                <FieldLabel htmlFor="automation-time">
                  {frequency === "hourly" ? "At minute (of this time)" : "Time"}
                </FieldLabel>
                <Input
                  id="automation-time"
                  type="time"
                  aria-invalid={!!errors.time}
                  {...register("time")}
                />
                <FieldDescription>Your time zone: {timezone}</FieldDescription>
                <FieldError errors={[errors.time]} />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="automation-device">Where it runs</FieldLabel>
              <NativeSelect
                id="automation-device"
                className="w-full"
                {...register("deviceId")}
              >
                <NativeSelectOption value="">
                  The bot&apos;s cloud computer
                </NativeSelectOption>
                {devices.map((device) => (
                  <NativeSelectOption key={device.id} value={device.id}>
                    My device: {device.name}
                    {device.online ? "" : " (offline now)"}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                {deviceId
                  ? "The agent must be running on that device at run time. Commands wait two minutes for your Allow (on the Your PC page) and are then skipped, unless you turned on Run commands without asking me for that device. Reading and writing files in the shared folder works either way."
                  : devices.length === 0
                    ? "Connect a device on the Your PC page to let a task work on your own files."
                    : "Pick one of your devices to let the task work on your own files."}
              </FieldDescription>
            </Field>

            <Field data-invalid={!!errors.webhookUrl}>
              <FieldLabel htmlFor="automation-webhook">
                Also send the result to (optional)
              </FieldLabel>
              <Input
                id="automation-webhook"
                type="url"
                placeholder="https://discord.com/api/webhooks/…"
                autoComplete="off"
                aria-invalid={!!errors.webhookUrl}
                {...register("webhookUrl")}
              />
              <FieldDescription>
                A Discord or Slack webhook URL, or a Telegram link like
                https://api.telegram.org/bot&lt;token&gt;/sendMessage?chat_id=&lt;id&gt;.
                Results always stay in your run history here too.
              </FieldDescription>
              <FieldError errors={[errors.webhookUrl]} />
            </Field>
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
            <Button type="submit" disabled={isSubmitting || noBots}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              Create automation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
