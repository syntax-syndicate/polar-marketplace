'use client'

import { Organization, SubscriptionTier } from '@polar-sh/sdk'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Button } from 'polarkit/components/ui/atoms'
import SubscriptionTierCard from './SubscriptionTierCard'
import { useSubscriptionCardAction } from './useSubscriptionCardAction'

interface PublicSubscriptionUpsellProps {
  organization: Organization
  subscriptionTiers: SubscriptionTier[]
  subscribePath: string
}

const PublicSubscriptionUpsell: React.FC<PublicSubscriptionUpsellProps> = ({
  organization,
  subscriptionTiers,
  subscribePath,
}) => {
  return (
    <div className="flex flex-col">
      <div className="flex flex-row items-start justify-between">
        <h2 className="text-lg">Subscriptions</h2>
        <Link
          href={{
            pathname: `/${organization.name}`,
            query: { tab: 'subscriptions' },
          }}
        >
          <Button variant="secondary" size="sm">
            View all Tiers
          </Button>
        </Link>
      </div>
      <motion.div
        className="-mx-6 flex h-fit flex-row gap-6 overflow-x-auto px-6 py-6 md:mx-0 md:px-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {subscriptionTiers
          .filter((tier) => tier.is_highlighted)
          .sort((a, b) => a.price_amount - b.price_amount)
          .map((tier) => (
            <SubscriptionCard
              key={tier.id}
              tier={tier}
              subscribePath={subscribePath}
              organization={organization}
            />
          ))}
      </motion.div>
    </div>
  )
}

export default PublicSubscriptionUpsell

const SubscriptionCard = ({
  tier,
  subscribePath,
  organization,
}: {
  tier: SubscriptionTier
  subscribePath: string
  organization: Organization
}) => {
  const action = useSubscriptionCardAction(tier, organization, subscribePath)

  return (
    <SubscriptionTierCard
      className="w-full"
      key={tier.id}
      subscriptionTier={tier}
      variant="small"
    >
      <Link className="w-full" href={action.link}>
        <Button
          className="bg-[--var-border-color] text-[--var-fg-color] transition-colors hover:bg-[--var-border-color] hover:text-white dark:border-none dark:bg-[--var-dark-border-color] dark:text-[--var-dark-fg-color] dark:hover:text-white"
          fullWidth
        >
          {action.label}
        </Button>
      </Link>
    </SubscriptionTierCard>
  )
}
