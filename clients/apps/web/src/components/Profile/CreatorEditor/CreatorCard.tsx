import { organizationPageLink } from '@/utils/nav'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DragIndicatorOutlined, GitHub } from '@mui/icons-material'
import { Organization } from '@polar-sh/api'
import Avatar from '@polar-sh/ui/components/atoms/Avatar'
import Button from '@polar-sh/ui/components/atoms/Button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@polar-sh/ui/components/atoms/Card'
import Link from 'next/link'
import { twMerge } from 'tailwind-merge'

export const CreatorCard = ({
  className,
  organization,
  disabled,
  sortable,
}: {
  className?: string
  organization: Organization
  disabled?: boolean
  sortable?: ReturnType<typeof useSortable>
}) => {
  return (
    <Card
      ref={sortable ? sortable.setNodeRef : undefined}
      style={
        sortable
          ? {
              transform: CSS.Transform.toString(sortable.transform),
              transition: sortable.transition,
            }
          : {}
      }
      className={twMerge(
        'dark:text-polar-500 dark:hover:text-polar-300 transition-color dark:hover:bg-polar-900 rounded-4xl flex flex-col text-gray-500 hover:bg-gray-50 hover:text-gray-600',
        sortable?.isDragging && 'opacity-30',
        className,
      )}
    >
      <Link className="h-full" href={organizationPageLink(organization)}>
        <CardHeader className="relative flex flex-row items-center gap-x-4 space-y-0 p-6">
          <Avatar
            className="h-10 w-10"
            avatar_url={organization.avatar_url}
            name={organization.name}
          />
          <div className="flex flex-col">
            <h3 className="text-gray-950 dark:text-white">
              {organization.name}
            </h3>
            <h3 className="text-sm text-blue-500 dark:text-blue-400">
              @{organization.slug}
            </h3>
          </div>
          {!disabled && (
            <span
              ref={
                disabled || !sortable ? undefined : sortable.setDraggableNodeRef
              }
              className="absolute right-6 top-6 cursor-grab"
              {...sortable?.attributes}
              {...sortable?.listeners}
            >
              <DragIndicatorOutlined
                className={twMerge('dark:text-polar-600 text-gray-400')}
                fontSize="small"
              />
            </span>
          )}
        </CardHeader>
        <CardContent className="flex h-full grow flex-col flex-wrap px-6 py-0">
          {organization.bio && (
            <p className="text-sm leading-relaxed [text-wrap:pretty]">
              {organization.bio}
            </p>
          )}
        </CardContent>
      </Link>
      <CardFooter className="flex flex-row items-center justify-between gap-x-4 p-6">
        <div className="flex w-full flex-row items-center gap-x-4">
          <Link
            href={`https://github.com/${organization.slug}`}
            target="_blank"
          >
            <Button className="aspect-square" size="icon" variant="secondary">
              <GitHub fontSize="inherit" />
            </Button>
          </Link>
        </div>
      </CardFooter>
    </Card>
  )
}

export const DraggableCreatorCard = ({
  className,
  organization,
  disabled,
}: {
  className?: string
  organization: Organization
  disabled?: boolean
}) => {
  const sortable = useSortable({ id: organization.id })

  return (
    <CreatorCard
      className={className}
      organization={organization}
      disabled={disabled}
      sortable={sortable}
    />
  )
}
