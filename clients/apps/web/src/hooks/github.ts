import { useStore } from '@/store'
import { getGitHubAuthorizeURL } from '@/utils/auth'
import { CONFIG } from '@/utils/config'
import { schemas } from '@polar-sh/client'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect } from 'react'
import { useGitHubAccount } from './oauth-accounts'

export const useRedirectToGitHubInstallation = (
  organization: schemas['Organization'],
): (() => void) => {
  const store = useStore()
  const pathname = usePathname()
  const gitHubAccount = useGitHubAccount()
  const authorizeURL = getGitHubAuthorizeURL({ return_to: pathname })

  const redirect = useCallback(() => {
    if (!gitHubAccount) {
      store.setGitHubInstallation({
        installAfterGitHubAuthentication: true,
        organizationId: organization.id,
      })
      window.location.href = authorizeURL
      return
    }
    store.setGitHubInstallation({
      installAfterGitHubAuthentication: false,
      organizationId: organization.id,
    })
    window.location.href = CONFIG.GITHUB_INSTALLATION_URL
  }, [store, authorizeURL, organization, gitHubAccount])

  useEffect(() => {
    if (
      gitHubAccount &&
      store.gitHubInstallation?.installAfterGitHubAuthentication === true
    ) {
      redirect()
    }
  }, [gitHubAccount, store.gitHubInstallation, redirect])

  return redirect
}
