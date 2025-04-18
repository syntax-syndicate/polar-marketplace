import { DollarSign } from 'lucide-react'
import {
  ChangeEvent,
  FocusEvent,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { twMerge } from 'tailwind-merge'
import Input from './Input'

interface Props {
  name: string
  placeholder: number
  id?: string
  onChange?: (value: number) => void
  onBlur?: (e: ChangeEvent<HTMLInputElement>) => void
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void
  value?: number
  className?: string
  disabled?: boolean
  preSlot?: React.ReactNode
  postSlot?: React.ReactNode
}

const getCents = (value: string): number => {
  let newAmount = Number.parseFloat(value)
  if (isNaN(newAmount)) {
    newAmount = 0
  }
  // Round to avoid floating point errors
  return Math.round(newAmount * 100)
}

const getInternalValue = (value: number | undefined): string | undefined => {
  return value ? (value / 100).toFixed(2) : undefined
}

const MoneyInput = (props: Props) => {
  let {
    id,
    name,
    value,
    placeholder,
    preSlot,
    postSlot,
    onChange: _onChange,
    onBlur,
    onFocus,
    disabled,
  } = props
  const [previousValue, setPreviousValue] = useState<number | undefined>(value)
  const [internalValue, setInternalValue] = useState<string | undefined>(
    getInternalValue(value),
  )

  useEffect(() => {
    if (value !== previousValue) {
      setPreviousValue(value)
      setInternalValue(getInternalValue(value))
    }
  }, [value, previousValue])

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (_onChange) {
        const newValue = getCents(e.target.value)
        setPreviousValue(newValue)
        _onChange(newValue)
      }
      setInternalValue(e.target.value)
    },
    [_onChange],
  )

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const regex = /^\d+([\.,]\d{0,2})?$/
    if (!regex.test(value)) {
      e.target.value = Number.parseFloat(value).toFixed(2)
    }
  }

  return (
    <Input
      type="number"
      step={0.1}
      id={id}
      name={name}
      className={twMerge(
        'dark:placeholder:text-polar-500 block w-full px-4 pl-8 text-base font-normal placeholder:text-gray-400',
        props.className ?? '',
      )}
      value={internalValue}
      onChange={onChange}
      onInput={onInput}
      placeholder={placeholder ? `${placeholder / 100}` : undefined}
      preSlot={preSlot ? preSlot : <DollarSign className="h-4 w-4" />}
      postSlot={postSlot}
      onBlur={onBlur}
      onFocus={onFocus}
      onWheel={(e) => {
        ;(e.target as HTMLInputElement).blur()
      }}
      disabled={disabled}
    />
  )
}

export default MoneyInput
