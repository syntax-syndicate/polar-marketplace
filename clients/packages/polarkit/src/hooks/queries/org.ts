import {
  ListResourceOrganization,
  OrganizationBadgeSettingsUpdate,
  OrganizationUpdate,
} from '@polar-sh/sdk'
import {
  UseMutationResult,
  UseQueryResult,
  useMutation,
  useQuery,
} from '@tanstack/react-query'
import { api, queryClient } from '../../api'
import { defaultRetry } from './retry'

export const useListOrganizations: () => UseQueryResult<ListResourceOrganization> =
  () =>
    useQuery({
      queryKey: ['user', 'organizations'],
      queryFn: () => api.organizations.list(),
      retry: defaultRetry,
    })

export const useOrganizationBadgeSettings = (id: string) =>
  useQuery({
    queryKey: ['organizationBadgeSettings', id],
    queryFn: () => api.organizations.getBadgeSettings({ id }),
    retry: defaultRetry,
  })

export const useUpdateOrganizationBadgeSettings: () => UseMutationResult<
  OrganizationBadgeSettingsUpdate,
  Error,
  {
    id: string
    settings: OrganizationBadgeSettingsUpdate
  },
  unknown
> = () =>
  useMutation({
    mutationFn: (variables: {
      id: string
      settings: OrganizationBadgeSettingsUpdate
    }) => {
      return api.organizations.updateBadgeSettings({
        id: variables.id,
        organizationBadgeSettingsUpdate: variables.settings,
      })
    },
    onSuccess: (result, variables, ctx) => {
      queryClient.invalidateQueries({
        queryKey: ['organizationBadgeSettings', variables.id],
      })
    },
  })

export const useUpdateOrganization = () =>
  useMutation({
    mutationFn: (variables: { id: string; settings: OrganizationUpdate }) => {
      return api.organizations.update({
        id: variables.id,
        organizationUpdate: variables.settings,
      })
    },
    onSuccess: (result, variables, ctx) => {
      queryClient.setQueriesData<ListResourceOrganization>(
        {
          queryKey: ['user', 'organizations'],
        },
        (data) => {
          if (!data) {
            return data
          }

          return {
            ...data,
            items: data.items?.map((i) => {
              if (i.id === result.id) {
                return {
                  ...i,
                  issue: result,
                }
              }
              return { ...i }
            }),
          }
        },
      )
    },
  })
