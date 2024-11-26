import { useAdvertisementDisplays } from '@/hooks/queries'
import { BenefitPublicInner } from '@polar-sh/sdk'
import { encode } from 'html-entities'
import Link from 'next/link'
import Textarea from 'polarkit/components/ui/atoms/textarea'
import { useEffect, useRef } from 'react'

export const AdsBenefitContent = ({
  benefit,
}: {
  benefit: BenefitPublicInner
}) => {
  const shortID = benefit.id.substring(benefit.id.length - 6)

  const height =
    'properties' in benefit && 'image_height' in benefit.properties
      ? benefit.properties.image_height
      : 100

  const width =
    'properties' in benefit && 'image_width' in benefit.properties
      ? benefit.properties.image_width
      : 240

  const { data: displays } = useAdvertisementDisplays(benefit.id)

  const showAds = displays?.items ?? []

  const formattedDisplays = showAds
    .map((a) => {
      let ad = `<a href="${encodeURI(a.link_url)}"><picture>`

      if (a.image_url_dark) {
        const image_url_dark = `https://polar.sh/embed/ad?id=${a.id}&dark=1`
        ad += `<source media="(prefers-color-scheme: dark)" srcset="${image_url_dark}">`
      }

      const image_url = `https://polar.sh/embed/ad?id=${a.id}`
      ad += `<img src="${image_url}" alt="${encode(a.text)}" height="${height}" width="${width}" />`

      ad += `</picture></a>`

      return ad
    })
    .join('\n')

  const code = `<!-- POLAR type=ads id=${shortID} subscription_benefit_id=${benefit.id} width=${width} height=${height} -->
${formattedDisplays}
<!-- POLAR-END id=${shortID} -->`

  const embedTextarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (embedTextarea.current) {
      embedTextarea.current.style.height = `${embedTextarea.current.scrollHeight}px`
    }
  }, [embedTextarea, code])

  return (
    <>
      <div className="flex flex-col gap-y-3">
        <h3 className="font-medium">Identifier</h3>
        <p className="dark:text-polar-400 text-sm text-gray-600">
          Use this ID when{' '}
          <Link
            href="/docs/ads"
            target="_blank"
            rel="noopener"
            className="text-blue-500 hover:text-blue-400 dark:text-blue-400 dark:hover:text-blue-300"
          >
            integrating
          </Link>{' '}
          ads in your README or website.
        </p>
        <pre>
          <code className="dark:bg-polar-700 rounded-md bg-gray-100 p-2 text-xs">
            {benefit.id}
          </code>
        </pre>
      </div>

      <div className="flex flex-col gap-y-3">
        <h3 className="font-medium">Markdown & HTML embed code</h3>
        <p className="dark:text-polar-400 text-sm text-gray-600">
          Use this to get started, and setup the{' '}
          <a
            href="https://github.com/polarsource/actions"
            rel="noopener"
            className="text-blue-500 hover:text-blue-400 dark:text-blue-400 dark:hover:text-blue-300"
          >
            GitHub Action
          </a>{' '}
          to keep it the ad automatically updated.
        </p>
        <Textarea
          ref={embedTextarea}
          className="dark:bg-polar-700 min-h-[100px] rounded-md border-0 bg-gray-100 font-mono text-xs text-gray-500"
          value={code}
          readOnly
        />
      </div>
    </>
  )
}
