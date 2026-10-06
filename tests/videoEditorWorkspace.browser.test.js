import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const fixturePath = '/__video-workspace-test'
const fixtureModule = 'virtual:video-workspace-fixture'
const fixture = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0"><div id="root"></div>
<script type="module" src="/@id/${fixtureModule}"></script></body></html>`
const fixtureCode = `
  import React from 'react'
  import { createRoot } from 'react-dom/client'
  import '/src/components/VideoEditor.css'
  import '/src/index.css'
  import '/src/App.css'
  import { VideoEditor } from '/src/components/VideoEditor.jsx'
  import { PhotoEditor } from '/src/components/PhotoEditor.jsx'
  createRoot(document.getElementById('root')).render(window.__photoMode
    ? React.createElement(PhotoEditor, { assets: [], onExport: () => {}, initialProject: {
        projectId: 'style-test', headline: 'Style test', aspectRatio: '1:1',
        layers: [{ id: 'text', type: 'text', value: 'Style test', label: 'Text', x: 20, y: 20, fontSize: 34 }]
      } })
    : React.createElement(VideoEditor, { assets: window.__videoTestAssets || [], onExport: (result) => {
        window.__videoExport = { summary: result.summary, sizeBytes: result.sizeBytes,
          totalClips: result.totalClips, durationSeconds: result.durationSeconds }
      } }))
`

test('video editor workspace consistency', async (t) => {
  const server = await createServer({
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'video-workspace-fixture',
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
  const url = `${server.resolvedUrls.local[0].replace(/\/$/, '')}${fixturePath}`

  await t.test('document commands and controls match Classic density, accent and rainbow Focus without leaking into Photo Editor', async (t) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    t.after(() => context.close())
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(url)
    const commands = page.getByRole('group', { name: 'Video document commands' })
    assert.equal(await commands.getByRole('button', { name: 'Export video', exact: true }).count(), 1)
    assert.equal(await commands.getByRole('button', { name: 'Undo', exact: true }).isDisabled(), true)
    const appearance = await commands.getByRole('button', { name: 'Export video', exact: true }).evaluate((button) => ({
      height: button.getBoundingClientRect().height,
      background: getComputedStyle(button).backgroundColor,
    }))
    assert.equal(appearance.height, 28)
    assert.equal(appearance.background, 'rgb(113, 55, 232)')
    const focus = commands.locator('.editor-focus-button')
    assert.equal(await focus.evaluate((button) => {
      const rim = getComputedStyle(button, '::before')
      const outer = button.getBoundingClientRect()
      const inner = button.querySelector('.editor-focus-button-inner').getBoundingClientRect()
      return rim.animationName === 'editor-focus-spin' && rim.backgroundImage.includes('conic-gradient')
        && inner.top >= outer.top && inner.bottom <= outer.bottom
    }), true)
    await focus.click()
    assert.equal(await page.getByRole('button', { name: /Restore site/ }).getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: /Restore site/ }).click()
    const photoPage = await context.newPage()
    await photoPage.addInitScript(() => { window.__photoMode = true })
    await photoPage.goto(url)
    const workspace = photoPage.getByRole('group', { name: 'Editor workspace' })
    await workspace.getByRole('button', { name: 'Classic', exact: true }).click()
    assert.equal((await photoPage.getByRole('button', { name: 'Save', exact: true }).boundingBox()).height, 28)
    assert.equal(await photoPage.locator('.photo-stage').evaluate((element) => element.style.background), 'rgb(15, 23, 42)')
    await workspace.getByRole('button', { name: 'Simple', exact: true }).click()
    assert.equal(await photoPage.locator('.photo-modern-tools').isVisible(), true)
    assert.deepEqual(errors, [])
  })

  await t.test('responsive organization keeps every video tool panel and inspector reachable with readable light controls', async (t) => {
    const context = await browser.newContext()
    t.after(() => context.close())
    const page = await context.newPage()
    await page.goto(url)
    for (const width of [1440, 1000, 800, 375]) {
      await page.setViewportSize({ width, height: 1000 })
      const inspector = page.getByRole('complementary', { name: 'Video inspector' })
      assert.equal(await inspector.isVisible(), true)
      for (const panel of ['Media', 'Transitions', 'Effects', 'Filters', 'Text', 'Audio & EQ', 'Elements']) {
        const button = page.getByRole('group', { name: 'Video tool panels' }).getByRole('button', { name: panel, exact: true })
        await button.click()
        assert.equal(await button.getAttribute('aria-pressed'), 'true')
        const bounds = await button.boundingBox()
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `${panel} fits at ${width}px`)
      }
      await page.getByRole('group', { name: 'Video inspector panels' }).getByRole('button', { name: 'video', exact: true }).click()
      const format = inspector.getByLabel(/^Project format/)
      await format.scrollIntoViewIfNeeded()
      const bounds = await format.boundingBox()
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width)
      assert.equal(await format.evaluate((element) => getComputedStyle(element).color), 'rgb(23, 32, 51)')
      const commands = await page.getByRole('group', { name: 'Video document commands' }).boundingBox()
      assert.ok(commands.x >= 0 && commands.x + commands.width <= width)
      if (width <= 900) {
        assert.ok((await page.getByRole('button', { name: 'Select', exact: true }).boundingBox()).height >= 40)
      }
      await page.getByRole('group', { name: 'Video tool panels' }).getByRole('button', { name: 'Media', exact: true }).click()
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: `/home/codespace/.copilot/session-state/b4bb868c-9596-4d47-a3d5-eac962444037/files/video-workspace-${width}.png`, fullPage: true })
    }
  })

  await t.test('text clips, duplication, undo, tracks, playback, zoom and project settings retain video behavior', async (t) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    t.after(() => context.close())
    const page = await context.newPage()
    await page.goto(url)
    const panels = page.getByRole('group', { name: 'Video tool panels' })
    await panels.getByRole('button', { name: 'Text', exact: true }).click()
    await page.getByRole('button', { name: 'Title', exact: true }).click()
    assert.equal(await page.locator('.clip').count(), 1)
    await page.getByLabel('Content', { exact: true }).fill('Video regression title')
    assert.equal(await page.locator('.preview-text-overlay').textContent(), 'Video regression title')
    await page.getByRole('button', { name: /Duplicate/ }).click()
    assert.equal(await page.locator('.clip').count(), 2)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    assert.equal(await page.locator('.clip').count(), 1)
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    assert.equal(await page.locator('.clip').count(), 2)
    const tracks = await page.locator('.track').count()
    await page.getByRole('button', { name: '+ Video', exact: true }).click()
    assert.equal(await page.locator('.track').count(), tracks + 1)
    await page.getByLabel('Timeline zoom', { exact: true }).fill('2')
    assert.equal(await page.getByLabel('Timeline zoom', { exact: true }).inputValue(), '2')
    await page.getByRole('button', { name: /Snap/ }).click()
    assert.equal(await page.getByRole('button', { name: /Snap/ }).getAttribute('aria-pressed'), 'false')
    await page.getByTitle('Play', { exact: true }).click()
    await page.getByTitle('Pause', { exact: true }).waitFor()
    await page.waitForFunction(() => !document.querySelector('.time-display').textContent.trim().startsWith('0s'))
    await page.getByTitle('Stop', { exact: true }).click()
    await page.getByTitle('Play', { exact: true }).waitFor()
    assert.match(await page.locator('.time-display').textContent(), /30s/)
    await panels.getByRole('button', { name: 'Audio & EQ', exact: true }).click()
    assert.equal(await page.getByRole('heading', { name: 'Record voice-over', exact: true }).isVisible(), true)
    assert.equal(await page.getByRole('heading', { name: 'Whole project', exact: true }).isVisible(), true)
  })

  await t.test('media preview, filters, export and project format remain functional after styling changes', async (t) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    t.after(() => context.close())
    await context.addInitScript(() => {
      window.__videoTestAssets = [{
        id: 'image', name: 'Test image', type: 'image',
        previewUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>'),
      }]
    })
    const page = await context.newPage()
    await page.goto(url)
    await page.getByLabel(/^Project format/).selectOption('9:16')
    assert.equal(await page.locator('.preview-stage-shell').evaluate((element) => element.style.aspectRatio), '9 / 16')
    await page.getByRole('button', { name: 'Test image Tap to add', exact: true }).click()
    await page.locator('.preview-image').waitFor()
    await page.locator('.clip').click()
    const panels = page.getByRole('group', { name: 'Video tool panels' })
    await panels.getByRole('button', { name: 'Filters', exact: true }).click()
    await page.getByRole('button', { name: 'B&W', exact: true }).click()
    assert.match(await page.locator('.preview-image').getAttribute('style'), /grayscale\(100%\)/)
    await page.getByTitle('Save snapshot', { exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Play or select a decodable video clip before taking a snapshot.' }).waitFor()
    await page.getByTitle('Hide track', { exact: true }).first().click()
    assert.equal(await page.locator('.preview-image').count(), 0)
    await page.getByTitle('Show track', { exact: true }).first().click()
    assert.equal(await page.locator('.preview-image').count(), 1)
    await page.getByTitle('Lock track', { exact: true }).first().click()
    assert.equal(await page.getByTitle('Unlock track', { exact: true }).count(), 1)
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 90000 }),
      page.getByRole('group', { name: 'Video document commands' }).getByRole('button', { name: 'Export video', exact: true }).click(),
    ])
    assert.match(download.suggestedFilename(), /\.webm$/)
    assert.equal(await download.failure(), null)
    const exported = await page.evaluate(() => window.__videoExport)
    assert.match(exported.summary, /1080x1920 at 30 fps/)
    assert.equal(exported.totalClips, 1)
    assert.equal(exported.durationSeconds, 30)
    assert.ok(exported.sizeBytes > 0)
  })
})
