'use client'

import { ChevronLeftRounded, ChevronRightRounded } from '@mui/icons-material'
import Button from '@polar-sh/ui/components/atoms/Button'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useState } from 'react'

const variants = {
  enter: (direction: number) => {
    return {
      x: direction > 0 ? 1000 : -1000,
      opacity: 0,
    }
  },
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => {
    return {
      zIndex: 0,
      x: direction < 0 ? 1000 : -1000,
      opacity: 0,
    }
  },
}

const swipeConfidenceThreshold = 10000
const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity
}

interface SlideshowProps {
  images: string[]
}

export const Slideshow = ({ images }: SlideshowProps) => {
  const [[page, direction], setPage] = useState([0, 0])
  const imageIndex = Math.abs(page % images.length)
  const hasMultipleImages = images.length > 1

  const paginate = useCallback(
    (newDirection: number) => {
      setPage([page + newDirection, newDirection])
    },
    [setPage, page],
  )

  return (
    <div className="dark:bg-polar-900 dark:border-polar-700 relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-gray-100 bg-cover bg-center lg:rounded-3xl dark:border">
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          className="absolute inset-0 h-full w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${images[imageIndex]})` }}
          key={page}
          custom={direction}
          variants={variants}
          {...(hasMultipleImages && {
            initial: 'enter',
            animate: 'center',
            exit: 'exit',
            transition: {
              x: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            },
            drag: 'x',
            dragConstraints: { left: 0, right: 0 },
            dragElastic: 1,
            onDragEnd: (_, { offset, velocity }) => {
              const swipe = swipePower(offset.x, velocity.x)

              if (swipe < -swipeConfidenceThreshold) {
                paginate(1)
              } else if (swipe > swipeConfidenceThreshold) {
                paginate(-1)
              }
            },
          })}
        />
      </AnimatePresence>

      {hasMultipleImages && (
        <div className="absolute bottom-6 left-6 z-10 flex flex-row items-center justify-between gap-x-2">
          <Button
            className="h-8 w-8 rounded-full bg-gray-50 shadow-sm"
            variant="secondary"
            onClick={() => paginate(-1)}
          >
            <ChevronLeftRounded fontSize="inherit" />
          </Button>
          <Button
            className="h-8 w-8 rounded-full bg-gray-50 shadow-sm"
            variant="secondary"
            onClick={() => paginate(1)}
          >
            <ChevronRightRounded fontSize="inherit" />
          </Button>
        </div>
      )}
    </div>
  )
}
