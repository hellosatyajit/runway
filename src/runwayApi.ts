import { foldSnapshot } from './foldSnapshot'

export type RunwayData = {
  syncedAt: string
  currency: string
  liquid: number
  investments: number
  debt: number
  burn: number
  monthlyBurn: Array<{ label: string; value: number }>
  excludedCategories: string[]
}

const baseUrl = import.meta.env.VITE_RUNWAY_API_URL as string | undefined
const token = import.meta.env.VITE_RUNWAY_API_TOKEN as string | undefined

export const fallbackData: RunwayData = {
  ...foldSnapshot,
  monthlyBurn: [...foldSnapshot.monthlyBurn],
  excludedCategories: [...foldSnapshot.excludedCategories],
}

function headers() {
  return { authorization: `Bearer ${token ?? ''}`, 'content-type': 'application/json' }
}

function normalize(payload: any): RunwayData {
  return {
    syncedAt: payload.syncedAt,
    currency: payload.currency,
    liquid: payload.liquid,
    investments: payload.investments,
    debt: payload.debt,
    burn: payload.burn,
    monthlyBurn: payload.monthlyBurn,
    excludedCategories: payload.methodology?.excludedCategories ?? fallbackData.excludedCategories,
  }
}

export async function loadRunway(): Promise<RunwayData> {
  if (!baseUrl || !token) return fallbackData
  const response = await fetch(`${baseUrl}/api/runway`, { headers: headers() })
  if (!response.ok) throw new Error('Could not load the latest runway snapshot')
  return normalize(await response.json())
}

export async function refreshRunway(): Promise<RunwayData> {
  if (!baseUrl || !token) throw new Error('Runway API is not configured')
  const response = await fetch(`${baseUrl}/api/refresh`, { method: 'POST', headers: headers() })
  if (!response.ok) throw new Error('Fold refresh failed')
  return normalize(await response.json())
}
