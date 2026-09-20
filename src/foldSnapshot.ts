export const foldSnapshot = {
  syncedAt: '2026-01-01T00:00:00.000Z',
  currency: 'INR',
  liquid: 100000,
  investments: 500000,
  debt: 0,
  burn: 75000,
  monthlyBurn: [
    { label: 'Oct', value: 72000 },
    { label: 'Nov', value: 78000 },
    { label: 'Dec', value: 75000 },
  ],
  excludedCategories: ['Returns', 'Investments', 'Lent', 'Support', 'Business', 'Top-up'],
} as const
