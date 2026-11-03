import test from 'node:test'
import assert from 'node:assert/strict'
import { cwd } from 'node:process'
import { createServer } from 'vite'

test('managed directory loads beyond the API row limit and preserves authoritative activity', async (t) => {
  const profiles = Array.from({ length: 1101 }, (_, index) => ({
    id: `user-${String(index).padStart(4, '0')}`,
    full_name: `User ${index}`,
    created_at: '2026-10-01T00:00:00Z',
    is_beta_tester: index % 2 === 0,
  }))
  const pageStarts = []
  let failure = ''
  const client = {
    from(table) {
      return {
        select() { return this },
        order(field) { assert.equal(field, 'id'); return this },
        range(start, end) {
          pageStarts.push(start)
          return Promise.resolve({ data: profiles.slice(start, end + 1), error: failure === 'profiles' ? { message: 'Profiles unavailable' } : null })
        },
        in(field, ids) {
          assert.equal(table, 'user_directory_activity')
          assert.equal(field, 'user_id')
          assert.ok(ids.length <= 100)
          return Promise.resolve({
            data: ids.map((id) => ({
              user_id: id, signed_up_at: '2026-01-01T00:00:00Z',
              last_sign_in_at: '2026-11-03T00:00:00Z', sign_in_count: 2,
            })),
            error: failure === 'activity' ? { message: 'Activity unavailable' } : null,
          })
        },
      }
    },
  }
  globalThis.__directoryTestClient = client
  t.after(() => { delete globalThis.__directoryTestClient })
  const server = await createServer({
    server: { middlewareMode: true },
    plugins: [{
      name: 'directory-client-fixture',
      enforce: 'pre',
      load(id) {
        if (id === `${cwd()}/src/lib/supabase.js`) {
          return 'export const isSupabaseConfigured = true; export const supabase = globalThis.__directoryTestClient'
        }
      },
    }],
  })
  t.after(() => server.close())
  const { authService } = await server.ssrLoadModule('/src/services/authService.js')
  const users = await authService.getManagedUsers()
  assert.equal(users.length, 1101)
  assert.deepEqual(pageStarts, Array.from({ length: 12 }, (_, index) => index * 100))
  assert.equal(new Set(users.map((user) => user.id)).size, 1101)
  assert.equal(users[0].createdAt, '2026-01-01T00:00:00Z')
  assert.equal(users[0].lastSignInAt, '2026-11-03T00:00:00Z')
  assert.equal(users[0].signInCount, 2)
  assert.equal(users[0].isBetaTester, true)
  assert.equal(users[1].isBetaTester, false)

  failure = 'profiles'
  await assert.rejects(() => authService.getManagedUsers(), /Profiles unavailable/)
  failure = 'activity'
  await assert.rejects(() => authService.getManagedUsers(), /Apply the user directory activity migration/)
})
