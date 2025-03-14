import BadgeMessageForm from '@/components/Issues/BadgeMessageForm'
import PublicRewardsSetting from '@/components/Issues/UpfrontRewards'
import {
  useOrganizationBadgeSettings,
  useUpdateOrganization,
  useUpdateOrganizationBadgeSettings,
} from '@/hooks/queries'
import { useOrganizationSSE } from '@/hooks/sse'
import { ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { InfoOutlined } from '@mui/icons-material'
import { schemas } from '@polar-sh/client'
import Button from '@polar-sh/ui/components/atoms/Button'
import MoneyInput from '@polar-sh/ui/components/atoms/MoneyInput'
import ShadowBox from '@polar-sh/ui/components/atoms/ShadowBox'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useTimeoutFn } from 'react-use'
import { twMerge } from 'tailwind-merge'
import SettingsCheckbox from '../SettingsCheckbox'
import BadgeRepositories from './Repositories'
import { AllRetroactiveChanges, RetroactiveChanges } from './types'

const continueTimeoutSeconds = 10

interface SSEIssueSyncEvent {
  synced_issues: number
  open_issues: number
  repository_id: string
}

/**
 * Since 2023-10-24 we always default new accounts to show amount.
 *
 * We should migrate existing accounts to this new standard for simplicity.
 * However, we'll do that as a separate effort and therefore the setting
 * remains (default: true) here even though it's not exposed.
 */
interface MappedRepoSettings {
  show_amount: boolean
  minimum_amount: number
  message: string | undefined
  repositories: {
    [id: string]: schemas['RepositoryBadgeSettingsRead']
  }
  repositories_order: string[]
}

const getMappedSettings = (
  remote: schemas['OrganizationBadgeSettingsRead'] | undefined,
): MappedRepoSettings | undefined => {
  if (!remote) return undefined

  let order: string[] = []
  let mapped: Record<string, schemas['RepositoryBadgeSettingsRead']> = {}
  remote.repositories.map((repo) => {
    order.push(repo.id)
    mapped[repo.id] = repo
  })

  let ret = {
    show_amount: remote.show_amount,
    minimum_amount: remote.minimum_amount,
    message: remote.message || '',
    repositories: mapped,
    repositories_order: order,
  }
  return ret
}

const getRetroactiveChanges = (
  repos: schemas['RepositoryBadgeSettingsRead'][],
): AllRetroactiveChanges => {
  return repos.reduce(
    (ret: Record<string, RetroactiveChanges>, repo): AllRetroactiveChanges => {
      let changes: RetroactiveChanges = {
        additions: 0,
        removals: 0,
      }
      if (!repo.is_private) {
        if (repo.badge_auto_embed) {
          changes.additions =
            repo.synced_issues -
            (repo.auto_embedded_issues + repo.label_embedded_issues)
        } else {
          changes.removals = repo.auto_embedded_issues
        }
      }

      ret[repo.id] = changes
      return ret
    },
    {},
  )
}

const BadgeSetup = ({
  org,
  showControls,
  setShowControls,
  setSyncIssuesCount,
  isSettingPage = false,
}: {
  org: schemas['Organization']
  showControls: boolean
  setShowControls: (state: boolean) => void
  setSyncIssuesCount: (state: number) => void
  isSettingPage?: boolean
}) => {
  const remoteSettings = useOrganizationBadgeSettings(org.id)
  const [settings, setSettings] = useState<MappedRepoSettings>({
    show_amount: true,
    minimum_amount: 2000,
    repositories: {},
    repositories_order: [],
    message: '',
  })
  const [isRetroactiveEnabled, setRetroactiveEnabled] = useState<boolean>(false)
  const emitter = useOrganizationSSE(org.id)

  useEffect(() => {
    if (!remoteSettings.data) return
    const settings = getMappedSettings(remoteSettings.data)
    if (settings) {
      setSettings(settings)
    }
  }, [remoteSettings.data])

  useEffect(() => {
    if (!settings) return

    const repos = Object.values(settings.repositories)
    const countOpenIssues = repos.reduce(
      (acc, repo) => acc + repo.open_issues,
      0,
    )
    const countSyncedIssues = repos.reduce(
      (acc, repo) => acc + repo.synced_issues,
      0,
    )
    const isSyncCompleted = countSyncedIssues === countOpenIssues

    // Go to next step and setup in case syncing is complete
    setSyncIssuesCount(countSyncedIssues)

    if (countSyncedIssues / countOpenIssues > 0.4) {
      setShowControls(true)
    } else {
      setShowControls(isSyncCompleted)
    }
  }, [settings, setShowControls, setSyncIssuesCount])

  // // Show continue button after a few seconds OR once 40% sync is complete
  useTimeoutFn(() => setShowControls(true), continueTimeoutSeconds * 1000)

  const sync = ({
    data,
    completed = false,
  }: {
    data: SSEIssueSyncEvent
    completed?: boolean
  }) => {
    let synced = data.synced_issues
    if (completed) {
      /*
       * We only get updated processed counts when an issue is synced, but
       * there may be skipped issues in the end etc, so when we're finished,
       * we still need to update the processed count to the expected count.
       */
      synced = data.open_issues
    }

    setSettings((prev) => {
      const repo = prev.repositories[data.repository_id]
      return {
        ...prev,
        repositories: {
          ...prev.repositories,
          [data.repository_id]: {
            ...repo,
            // Make sure that processed doesn't decrease
            synced_issues: Math.max(synced, repo?.synced_issues || 0),
            open_issues: data.open_issues,
            completed,
          },
        },
      }
    })
  }

  useEffect(() => {
    const onIssueSyncCompleted = (data: SSEIssueSyncEvent) => {
      sync({ data, completed: true })
    }

    const onIssueSynced = (data: SSEIssueSyncEvent) => {
      sync({ data, completed: data.synced_issues === data.open_issues })
    }

    emitter.on('issue.synced', onIssueSynced)
    emitter.on('issue.sync.completed', onIssueSyncCompleted)

    return () => {
      emitter.off('issue.synced', onIssueSynced)
      emitter.off('issue.sync.completed', onIssueSyncCompleted)
    }
  }, [emitter])

  const sortedRepos =
    settings?.repositories_order.map((id) => {
      return settings.repositories[id]
    }) || []

  const retroactiveChanges = getRetroactiveChanges(sortedRepos)

  const [anyBadgeSettingChanged, setAnyBadgeSettingChanged] = useState(false)

  const onEnableBadgeChange = (
    repo: schemas['RepositoryBadgeSettingsRead'],
    enabled: boolean,
  ) => {
    setAnyBadgeSettingChanged(true)
    setSettings((prev) => {
      return {
        ...prev,
        repositories: {
          ...prev.repositories,
          [repo.id]: {
            ...prev.repositories[repo.id],
            badge_auto_embed: enabled,
          },
        },
      }
    })
  }

  const [upfrontSplitValue, setUpfrontSplitValue] = useState(
    org.default_upfront_split_to_contributors,
  )

  const updateOrg = useUpdateOrganization()

  const onSaveUpfrontSplit = async (value: number | null) => {
    setUpfrontSplitValue(value)

    await updateOrg.mutateAsync({
      id: org.id,
      body: {
        default_upfront_split_to_contributors: value,
        pledge_badge_show_amount: org.pledge_badge_show_amount,
        pledge_minimum_amount: org.pledge_minimum_amount,
      },
    })
  }

  if (!settings) return <></>

  return (
    <div className="w-full space-y-8">
      <motion.div
        variants={{
          hidden: {
            opacity: 0,
            scale: 0.95,
          },
          show: {
            opacity: 1,
            scale: [1, 1.05, 1],
          },
        }}
        initial={isSettingPage ? false : 'hidden'}
        animate="show"
      >
        <ShadowBox className="flex flex-col gap-y-8">
          <div className="flex flex-col space-y-4">
            <BadgeMessageForm
              value={settings.message || ''}
              onUpdateMessage={async (_value: string) => {}}
              onUpdateFundingGoal={async () => {}}
              showUpdateButton={false}
              showAmountRaised={settings.show_amount}
              orgName={org.name}
              onChangeMessage={(value: string) => {
                setSettings((prev) => {
                  return {
                    ...prev,
                    message: value,
                  }
                })
                setAnyBadgeSettingChanged(true)
              }}
              onChangeFundingGoal={() => {}}
              innerClassNames="border"
              funding={{
                pledges_sum: { amount: 5000, currency: 'usd' },
              }}
              canSetFundingGoal={false}
              title="Badge defaults"
              subtitle="You can override these settings later per issue too"
              upfrontSplit={upfrontSplitValue}
            />
            <div className="flex w-full flex-col space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="dark:text-polar-100 text-sm font-medium text-gray-900">
                    Minimum funding amount
                  </div>
                  <div className="dark:text-polar-400 mt-1 text-xs text-gray-600"></div>
                </div>

                <div>
                  <MoneyInput
                    id="minimum-pledge"
                    name="minimum-pledge"
                    onChange={(amount: number) => {
                      setSettings((prev) => {
                        return {
                          ...prev,
                          minimum_amount: amount,
                        }
                      })
                      setAnyBadgeSettingChanged(true)
                    }}
                    placeholder={settings.minimum_amount}
                    value={settings.minimum_amount}
                  />
                </div>
              </div>
            </div>

            <PublicRewardsSetting
              org={org}
              value={upfrontSplitValue}
              onSave={onSaveUpfrontSplit}
            />
          </div>

          <div className="dark:bg-polar-700 dark:text-polar-200 flex flex-row items-center rounded-full bg-gray-100 px-4 py-3 text-gray-500">
            <InfoOutlined width={24} height={24} />
            <p className="ml-4 text-xs">
              <strong className="dark:text-polar-200 mb-1 block font-medium text-gray-950">
                How is the Polar section added?
              </strong>
              Polar edits the issue description to add your custom promotion
              message and the Polar badge (SVG) at the end. You can remove it at
              any time.
            </p>
          </div>
        </ShadowBox>
      </motion.div>
      <BadgeRepositories
        repos={sortedRepos}
        isSettingPage={isSettingPage}
        showControls={showControls}
        onEnableBadgeChange={onEnableBadgeChange}
      />
      {showControls && (
        <motion.div
          variants={{
            hidden: {
              opacity: 0,
              scale: 1,
            },
            show: {
              opacity: 1,
              scale: [1, 1.1, 1],
            },
          }}
          initial={isSettingPage ? false : 'hidden'}
          animate="show"
          className="space-y-8"
        >
          <Controls
            org={org}
            showControls={showControls}
            setShowControls={setShowControls}
            isRetroactiveEnabled={isRetroactiveEnabled}
            setRetroactiveEnabled={setRetroactiveEnabled}
            retroactiveChanges={retroactiveChanges}
            settings={settings}
            isSettingPage={isSettingPage}
            anyBadgeSettingChanged={anyBadgeSettingChanged}
          />
        </motion.div>
      )}
    </div>
  )
}

const RetroactiveActivationLabel = ({
  additions,
  deletions,
}: {
  additions: number
  deletions: number
}) => {
  const hasAdditionsAndDeletions = additions > 0 && deletions > 0

  if (hasAdditionsAndDeletions) {
    return (
      <>
        Add badge to <strong className="text-medium">{additions}</strong> issues
        & remove from <strong className="text-medium">{deletions}</strong>.
      </>
    )
  }

  if (additions) {
    return (
      <>
        Add badge to <strong className="text-medium">{additions}</strong> open
        issues
      </>
    )
  }

  return (
    <>
      Remove badge from <strong className="text-medium">{deletions}</strong>{' '}
      existing issues
    </>
  )
}

export const Controls = ({
  org,
  showControls,
  setShowControls,
  isRetroactiveEnabled,
  setRetroactiveEnabled,
  retroactiveChanges,
  settings,
  isSettingPage,
  anyBadgeSettingChanged,
}: {
  org: schemas['Organization']
  showControls: boolean
  setShowControls: (state: boolean) => void
  isRetroactiveEnabled: boolean
  setRetroactiveEnabled: (state: boolean) => void
  retroactiveChanges: AllRetroactiveChanges | undefined
  settings: MappedRepoSettings
  isSettingPage: boolean
  anyBadgeSettingChanged: boolean
}) => {
  const router = useRouter()

  const redirectToOrgDashboard = () => {
    router.push(`/dashboard/${org.slug}`)
  }

  const isRetroactiveApplicable = (
    repo: schemas['RepositoryBadgeSettingsRead'],
  ): boolean => {
    if (!isRetroactiveEnabled) return false
    if (!retroactiveChanges) return false

    const changes = retroactiveChanges[repo.id]
    return changes.additions > 0 || changes.removals > 0
  }

  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  const updateBadgeSettings = useUpdateOrganizationBadgeSettings()

  const save = async () => {
    const data: schemas['OrganizationBadgeSettingsUpdate'] = {
      show_amount: settings.show_amount,
      minimum_amount: settings.minimum_amount,
      message: settings.message || '',
      repositories: Object.values(settings.repositories).map((repo) => {
        return {
          id: repo.id,
          badge_auto_embed: repo.badge_auto_embed,
          retroactive: isRetroactiveApplicable(repo),
        }
      }),
    }

    setIsSaving(true)

    await updateBadgeSettings.mutateAsync({
      id: org.id,
      settings: data,
    })

    setIsSaving(false)
    setIsSaved(true)

    setTimeout(() => {
      setIsSaved(false)
    }, 5000)
  }

  const clickedContinue = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (!showControls) {
      setShowControls(true)
    } else {
      await save()
      redirectToOrgDashboard()
    }
  }

  const clickedSave = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    await save()
  }

  const [additions, setAdditions] = useState(0)
  const [deletions, setDeletions] = useState(0)

  const hasRetroactiveChanges = additions > 0 || deletions > 0

  useEffect(() => {
    if (!retroactiveChanges) {
      setAdditions(0)
      setDeletions(0)
    } else {
      const add = Object.values(retroactiveChanges)
        .map((c) => c.additions)
        .reduce((a, b) => a + b, 0)
      const del = Object.values(retroactiveChanges)
        .map((c) => c.removals)
        .reduce((a, b) => a + b, 0)

      setAdditions(add)
      setDeletions(del)
    }
  }, [retroactiveChanges, isRetroactiveEnabled])

  const canSave = useMemo(() => {
    if (isSettingPage) {
      if (anyBadgeSettingChanged) {
        return true
      }
      return false
    }

    return true
  }, [isSettingPage, anyBadgeSettingChanged])

  return (
    <>
      {hasRetroactiveChanges && (
        <div className="dark:bg-polar-900 dark:border-polar-700 flex flex-row space-x-8 rounded-xl border bg-gray-50 p-4">
          <div className="w-1/2 items-center text-sm">
            <SettingsCheckbox
              id="retroactive_embed"
              title={
                <RetroactiveActivationLabel
                  additions={additions}
                  deletions={deletions}
                />
              }
              isChecked={isRetroactiveEnabled}
              onChange={(e) => {
                setRetroactiveEnabled(e.target.checked)
              }}
            />
          </div>
          <div className="dark:text-polar-400 flex w-1/2 flex-row items-center space-x-2 text-xs text-gray-500">
            <ExclamationCircleIcon width={16} height={16} />
            <p>Updates the modified at of the issues in GitHub.</p>
          </div>
        </div>
      )}

      {isSettingPage && (
        <div className="flex items-center space-x-8">
          <Button
            fullWidth={false}
            loading={isSaving}
            onClick={clickedSave}
            disabled={!canSave}
            className="min-w-[100px]"
          >
            <span>Save</span>
          </Button>

          <span
            className={twMerge(
              'dark:text-polar-400 text-sm leading-6 text-gray-500 transition-all duration-500',
              isSaved ? 'opacity-1' : 'opacity-0',
            )}
          >
            Changes saved.
            {additions > 0 && deletions > 0 && (
              <> Will add and remove badges in the background...</>
            )}
            {additions > 0 && deletions === 0 && (
              <> Will add badges in the background...</>
            )}
            {additions === 0 && deletions > 0 && (
              <> Will remove existing badges in the background...</>
            )}
          </span>
        </div>
      )}

      {!isSettingPage && (
        <div className="flex flex-col items-center">
          <Button onClick={clickedContinue} size="lg">
            {showControls ? 'Confirm' : 'Continue'}
          </Button>
        </div>
      )}
    </>
  )
}

export default BadgeSetup
