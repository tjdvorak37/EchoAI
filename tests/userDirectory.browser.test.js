import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const fixturePath = '/__user-directory-test'
const fixtureModule = 'virtual:user-directory-fixture'
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="root"></div><script type="module" src="/@id/${fixtureModule}"></script></body></html>`
const fixtureCode = `
  import React, { useState } from 'react'
  import { createRoot } from 'react-dom/client'
  import '/src/index.css'
  import '/src/App.css'
  import { AdminPanel } from '/src/components/AdminPanel.jsx'
  const dateAtAge = (days) => new Date(Date.now() - days * 86400000).toISOString()
  const user = (id, age, beta = false, signInCount = 1) => ({
    id, fullName: id, email: id + '@example.test', company: 'Test company',
    role: 'user', accessStatus: 'active', createdAt: dateAtAge(age),
    lastSignInAt: dateAtAge(0.5), isBetaTester: beta, signInCount,
  })
  const initialUsers = [
    ...Array.from({ length: 28 }, (_, i) => user('New-' + String(i).padStart(2, '0'), 1 + i / 100, i % 2 === 0)),
    user('Returning', 30, true, 2),
    user('Long-term', 100),
    { ...user('Unknown', 100), createdAt: null, lastSignInAt: null, signInCount: 0 },
    { ...user('Staff', 1), role: 'it' },
  ]
  function Fixture() {
    const [teamMembers, setTeamMembers] = useState(initialUsers)
    return React.createElement(AdminPanel, {
      teamMembers, currentUser: { id: '', role: 'admin' },
      licenses: [], tickets: [], purchaseHistory: [], companySeats: [], alerts: [],
      featureFlags: [], promoCodes: [], expenses: [], payroll: [], taxRecords: [],
      refunds: [], financialTasks: [], announcements: {},
      onAdminUserAction: async (params) => {
        window.__betaActions = [...(window.__betaActions || []), params]
        if (window.__holdBetaSave) await new Promise((resolve) => { window.__finishBetaSave = resolve })
        if (window.__betaSaveFails) throw new Error('Permission denied')
        setTeamMembers((members) => members.map((member) => member.id === params.userId
          ? { ...member, isBetaTester: params.isBetaTester } : member))
      },
      onRefreshUsers: async () => {
        if (window.__refreshFails) throw new Error('Directory refresh unavailable')
        const users = [...initialUsers, user('Fresh-signup', 0)]
        setTeamMembers(users)
        return users
      },
    })
  }
  createRoot(document.getElementById('root')).render(React.createElement(Fixture))
`

test('user directory grouping, search, pagination, refresh and responsive layout', async (t) => {
  const server = await createServer({
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'user-directory-fixture',
      resolveId: (id) => id === fixtureModule ? id : undefined,
      load: (id) => id === fixtureModule ? fixtureCode : undefined,
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url !== fixturePath) return next()
          try {
            res.setHeader('Content-Type', 'text/html')
            res.end(await vite.transformIndexHtml(fixturePath, fixture))
          } catch (error) {
            next(error)
          }
        })
      },
    }],
  })
  t.after(() => server.close())
  await server.listen()
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${server.resolvedUrls.local[0].replace(/\/$/, '')}${fixturePath}`)
  await page.getByRole('button', { name: 'People', exact: true }).click()
  await page.getByRole('button', { name: /Customer users/ }).click()

  const rows = page.locator('.it-user-row')
  const count = page.locator('.it-user-count')
  await page.getByRole('button', { name: 'All users: 31', exact: true }).waitFor()
  assert.equal(await rows.count(), 25)
  assert.match(await rows.first().innerText(), /New-00/)
  assert.match(await rows.first().innerText(), /Signed up:.*Last sign-in:/)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  assert.equal(await rows.count(), 6)
  await page.getByRole('combobox', { name: /^User group/ }).selectOption('returning')
  assert.match(await count.innerText(), /1 of 31 users match/)
  assert.match(await rows.first().innerText(), /Returning/)

  await page.getByRole('combobox', { name: /^Beta account/ }).selectOption('standard')
  assert.equal(await rows.count(), 0)
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await page.getByRole('combobox', { name: /^User group/ }).selectOption('new')
  await page.getByRole('combobox', { name: /^Beta account/ }).selectOption('beta')
  assert.equal(await rows.count(), 14)
  await page.getByLabel('Search', { exact: true }).fill('new-02@example.test')
  assert.equal(await rows.count(), 1)
  assert.match(await rows.first().innerText(), /New-02/)

  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await page.getByRole('combobox', { name: /^User group/ }).selectOption('long_term')
  assert.equal(await rows.count(), 1)
  assert.match(await rows.first().innerText(), /Long-term/)
  await page.getByRole('combobox', { name: /^User group/ }).selectOption('unknown')
  assert.match(await rows.first().innerText(), /Signed up: Unknown.*Last sign-in: Not recorded/)

  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await page.getByLabel('Search', { exact: true }).fill('new-01@example.test')
  assert.match(await rows.first().innerText(), /Beta tester access: OFF/)
  assert.equal(await page.locator('.it-user-detail').count(), 0)
  await page.evaluate(() => { window.__holdBetaSave = true })
  await page.getByRole('button', { name: 'Add beta tester access for New-01', exact: true }).click()
  const saving = page.getByRole('button', { name: 'Add beta tester access for New-01', exact: true })
  assert.equal(await saving.isDisabled(), true)
  assert.match(await saving.innerText(), /Saving beta access/)
  assert.match(await rows.first().innerText(), /Beta tester access: OFF/)
  await page.evaluate(() => { window.__finishBetaSave(); window.__holdBetaSave = false })
  await page.getByRole('status').filter({ hasText: 'Beta tester access added for New-01.' }).waitFor()
  assert.match(await rows.first().innerText(), /Beta tester access: ON/)
  assert.deepEqual(await page.evaluate(() => window.__betaActions), [{
    action: 'set-beta-ai-access', userId: 'New-01', email: 'New-01@example.test',
    isBetaTester: true, enabled: true, note: '',
  }])
  await page.getByRole('combobox', { name: /^Beta account/ }).selectOption('beta')
  await page.evaluate(() => { window.__betaSaveFails = true })
  await page.getByRole('button', { name: 'Remove beta tester access from New-01', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Could not change beta tester access for New-01: Permission denied' }).waitFor()
  assert.match(await rows.first().innerText(), /Beta tester access: ON/)
  assert.equal(await page.getByRole('button', { name: 'Remove beta tester access from New-01', exact: true }).isEnabled(), true)
  await page.evaluate(() => { window.__betaSaveFails = false })
  await page.getByRole('button', { name: 'Remove beta tester access from New-01', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Beta tester access removed from New-01.' }).waitFor()
  assert.equal(await rows.count(), 0)
  assert.equal(await page.getByRole('alert').count(), 0)
  await page.getByRole('combobox', { name: /^Beta account/ }).selectOption('standard')
  assert.match(await rows.first().innerText(), /Beta tester access: OFF/)
  assert.equal(await page.locator('.it-user-detail').count(), 0)

  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await page.getByRole('button', { name: 'Refresh users', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '1 newly listed account.' }).waitFor()
  assert.match(await rows.first().innerText(), /Fresh-signup/)
  await page.evaluate(() => { window.__refreshFails = true })
  await page.getByRole('button', { name: 'Refresh users', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Directory refresh unavailable' }).waitFor()
  assert.match(await rows.first().innerText(), /Fresh-signup/)

  await page.setViewportSize({ width: 390, height: 844 })
  const filters = page.locator('.it-user-filters')
  assert.equal(await filters.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length), 1)
  assert.equal(await page.getByRole('combobox', { name: /^Beta account/ }).isVisible(), true)
  assert.equal(await page.getByRole('button', { name: 'Add beta tester access for Fresh-signup', exact: true }).isVisible(), true)
  assert.deepEqual(errors, [])
})
