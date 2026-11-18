// "Work out pay" strip in the Job Kit (BJ, 2026-11-18): for a job that isn't on the Hot Jobs tab yet, pick the vendor and
// type the bill rate (+ zip, hours, weeks) and the weekly pay and hourly range fill in at once, worked out by the hub's
// Deal Sheet with the same margin rules as Hot Jobs. Only shown when the hub has plugged its calculator in.
import { useEffect, useRef, useState } from 'react'
import { Calculator } from 'lucide-react'
import { getPayTools, type PayAnswer } from './connectors'
import { formatDuration, formatMoneyRange, formatShift } from './normalize'
import { parseLocation } from '../photos/location'

/** keys kept with the job (so Recent jobs bring the numbers back); they aren't on any design */
export const PAY_KEYS = { bill: 'pay__bill', vendor: 'pay__vendor', zip: 'pay__zip', hours: 'pay__hours', weeks: 'pay__weeks' } as const

const num = (s: string | undefined) => {
  const n = Number(String(s ?? '').replace(/[^\d.]/g, ''))
  return n > 0 ? n : undefined
}
const hr = (n: number) => (Number.isInteger(Math.round(n * 100) / 100) ? String(Math.round(n)) : n.toFixed(2))
const shiftFor = (hours: number) => {
  const len = hours % 12 === 0 ? 12 : hours % 10 === 0 ? 10 : 8
  return hours % len === 0 ? `${hours / len}x${len}` : ''
}

export function PayCalc({ fields, setFields }: { fields: Record<string, string>; setFields: (fn: (f: Record<string, string>) => Record<string, string>) => void }) {
  const tools = getPayTools()
  const [vendors, setVendors] = useState<{ id: string; name: string; fee: string }[]>([])
  const [answer, setAnswer] = useState<PayAnswer | null>(null)
  useEffect(() => {
    if (tools) void tools.vendors().then(setVendors, () => setVendors([]))
  }, [tools])

  const bill = num(fields[PAY_KEYS.bill])
  const vendorId = fields[PAY_KEYS.vendor] ?? ''
  const zip = (fields[PAY_KEYS.zip] ?? '').trim()
  const hours = num(fields[PAY_KEYS.hours])
  const weeks = num(fields[PAY_KEYS.weeks])
  const loc = parseLocation(fields.location ?? '')
  const start = fields.start_date ?? ''

  // recalculate when the calculator's own inputs (or the job's place / start) change; typing over the pay fields
  // afterwards is kept
  const run = useRef(0)
  useEffect(() => {
    if (!tools) return
    if (!bill || !vendorId || !loc || (zip && !/^\d{5}$/.test(zip))) {
      setAnswer(null)
      return
    }
    const id = ++run.current
    const t = setTimeout(() => {
      void tools
        .estimate({ billRate: bill, vendorId, city: loc.city, state: loc.st, zip: zip || undefined, hours, weeks, start })
        .then((a) => {
          if (id !== run.current) return
          setAnswer(a)
          if (!a.ok) return
          setFields((f) => ({
            ...f,
            weekly_pay: formatMoneyRange(a.weekly[0] === a.weekly[1] ? `${a.weekly[1]}` : `${a.weekly[0]}-${a.weekly[1]}`),
            wage_low: hr(a.hourly[0]),
            wage_high: hr(a.hourly[1]),
            ...(weeks ? { duration: formatDuration(String(weeks)) } : {}),
            ...(hours && !f.shift?.trim() && shiftFor(hours) ? { shift: formatShift(shiftFor(hours)) } : {}),
          }))
        }, () => id === run.current && setAnswer({ ok: false, reason: 'Pay couldn’t be worked out' }))
    }, 250)
    return () => clearTimeout(t)
  }, [tools, bill, vendorId, zip, hours, weeks, loc?.city, loc?.st, start]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!tools) return null
  const put = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }))
  const missing = !bill ? 'the bill rate' : !vendorId ? 'the vendor' : !loc ? 'the location (City, ST) above' : zip && !/^\d{5}$/.test(zip) ? 'a 5-digit zip' : ''

  return (
    <div className="col-span-2 rounded-xl border border-line bg-surface-2/60 p-2.5 mb-1">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-ink-2 mb-1.5">
        <Calculator size={13} className="text-accent" /> Work out pay
        <span className="font-normal text-ink-3">· Deal Sheet, same rules as Hot Jobs</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0">
          <span className="block text-[11px] font-semibold text-ink-3 mb-1">Bill rate</span>
          <input className="input tabular-nums" inputMode="decimal" placeholder="$78" value={fields[PAY_KEYS.bill] ?? ''} onChange={(e) => put(PAY_KEYS.bill, e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <label className="min-w-0">
          <span className="block text-[11px] font-semibold text-ink-3 mb-1">Vendor</span>
          <select className="input" value={vendorId} onChange={(e) => put(PAY_KEYS.vendor, e.target.value)}>
            <option value="">{vendors.length ? 'Pick a vendor…' : 'Loading…'}</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.fee ? ` · ${v.fee}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="block text-[11px] font-semibold text-ink-3 mb-1">Zip (optional)</span>
          <input className="input tabular-nums" inputMode="numeric" maxLength={5} placeholder="City’s per diem" value={zip} onChange={(e) => put(PAY_KEYS.zip, e.target.value.replace(/\D/g, '').slice(0, 5))} />
        </label>
        <div className="grid grid-cols-2 gap-2 min-w-0">
          <label className="min-w-0">
            <span className="block text-[11px] font-semibold text-ink-3 mb-1 truncate">Hours/wk</span>
            <input className="input tabular-nums" inputMode="numeric" placeholder={String(tools.defaults.hours)} value={fields[PAY_KEYS.hours] ?? ''} onChange={(e) => put(PAY_KEYS.hours, e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
          <label className="min-w-0">
            <span className="block text-[11px] font-semibold text-ink-3 mb-1 truncate">Weeks</span>
            <input className="input tabular-nums" inputMode="numeric" placeholder={String(tools.defaults.weeks)} value={fields[PAY_KEYS.weeks] ?? ''} onChange={(e) => put(PAY_KEYS.weeks, e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
        </div>
      </div>
      <div className="mt-1.5 text-[11.5px] min-h-[16px]" title={answer?.ok ? answer.note : undefined}>
        {missing ? (
          <span className="text-ink-3">Add {missing} to fill the pay below.</span>
        ) : !answer ? (
          <span className="text-ink-3">Working it out…</span>
        ) : answer.ok ? (
          <span className="text-ink-2">
            Filled below: <b className="tabular-nums">{formatMoneyRange(`${answer.weekly[0]}-${answer.weekly[1]}`)}</b>/wk · <b className="tabular-nums">${hr(answer.hourly[0])} – ${hr(answer.hourly[1])}</b>/hr
          </span>
        ) : (
          <span className="text-[rgb(var(--status-warn))]">{answer.reason}</span>
        )}
      </div>
    </div>
  )
}
