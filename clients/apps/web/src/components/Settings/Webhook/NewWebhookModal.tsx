'use client'

import {
  Organization,
  ResponseError,
  WebhookEndpoint,
  WebhookEndpointCreate,
} from '@polar-sh/api'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'

import { InlineModalHeader } from '@/components/Modal/InlineModal'
import { toast } from '@/components/Toast/use-toast'
import { useCreateWebhookEndpoint } from '@/hooks/queries'
import Button from '@polar-sh/ui/components/atoms/Button'
import Banner from '@polar-sh/ui/components/molecules/Banner'
import { Form } from '@polar-sh/ui/components/ui/form'
import Link from 'next/link'
import { FieldEvents, FieldFormat, FieldSecret, FieldUrl } from './WebhookForm'

export default function NewWebhookModal({
  organization,
  hide,
}: {
  organization: Organization
  hide: () => void
}) {
  const form = useForm<WebhookEndpointCreate>({
    defaultValues: {
      organization_id: organization.id,
    },
  })

  const { handleSubmit } = form

  const [created, setCreated] = useState<WebhookEndpoint>()
  const [isCreating, setIsCreating] = useState(false)

  const createWebhookEndpoint = useCreateWebhookEndpoint()

  const onSubmit = useCallback(
    async (form: WebhookEndpointCreate) => {
      setIsCreating(true)

      try {
        const res = await createWebhookEndpoint.mutateAsync(form)

        toast({
          title: 'Webhook Endpoint Created',
          description: `Webhook Endpoint was created successfully`,
        })

        setCreated(res)
        hide()
      } catch (e) {
        if (e instanceof ResponseError) {
          toast({
            title: 'Webhook Endpoint Creation Failed',
            description: `Error creating Webhook Endpoint: ${e.message}`,
          })
        }
      } finally {
        setIsCreating(false)
      }
    },
    [hide, createWebhookEndpoint, setCreated, setIsCreating],
  )

  return (
    <div className="flex flex-col overflow-y-auto">
      <InlineModalHeader hide={hide}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl">New webhook</h2>
        </div>
      </InlineModalHeader>
      <div className="flex flex-col gap-y-8 p-8">
        {created ? (
          <Banner color={'green'}>
            <div className="flex w-full flex-row items-center justify-between">
              <span>Your hook was setup, and is now receiving events!</span>
              <Link
                href={`/dashboard/${organization.slug}/settings/webhooks/endpoints/${created.id}`}
                className="shrink-0"
              >
                <Button asChild>Go to</Button>
              </Link>
            </div>
          </Banner>
        ) : null}

        <Form {...form}>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="max-w-[700px] space-y-8"
          >
            <FieldUrl />
            <FieldFormat />
            <FieldSecret isUpdate={false} />
            <FieldEvents />

            <Button
              type="submit"
              loading={isCreating}
              disabled={Boolean(created)}
            >
              Create
            </Button>
          </form>
        </Form>
      </div>
    </div>
  )
}
