import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
          totalClips: result.totalClips, durationSeconds: result.durationSeconds,
          clips: result.tracks.flatMap((track) => track.clips) }
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

  await t.test('Screen Capture sits after Stock library without a spare row and keeps recording actions, errors and stop controls', async (t) => {
    const context = await browser.newContext({ viewport: { width: 1615, height: 1000 } })
    t.after(() => context.close())
    await context.addInitScript(() => {
      navigator.mediaDevices.getDisplayMedia = async (options) => {
        window.__captureOptions = options
        if (!window.__allowCapture) throw new DOMException('Denied by test', 'NotAllowedError')
        const canvas = document.createElement('canvas')
        canvas.width = 160
        canvas.height = 90
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = 'red'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        return canvas.captureStream(30)
      }
    })
    const page = await context.newPage()
    await page.goto(url)
    const capture = page.getByRole('combobox', { name: 'Screen Capture', exact: true })
    const stock = await page.getByRole('button', { name: 'Stock library', exact: true }).boundingBox()
    const bounds = await capture.boundingBox()
    const time = await page.locator('.time-display').boundingBox()
    assert.ok(stock.x + stock.width <= bounds.x && bounds.x + bounds.width <= time.x)
    assert.ok(Math.abs(stock.y - bounds.y) < 3)
    assert.equal(await page.locator('.screen-record-bar').count(), 0)
    const header = await page.locator('.video-editor-intro').boundingBox()
    const toolbar = await page.getByLabel('Video editing toolbar', { exact: true }).boundingBox()
    assert.ok(toolbar.y <= header.y + header.height + 2)
    await capture.selectOption('screen')
    await page.getByRole('alert').filter({ hasText: 'Screen access was denied.' }).waitFor()
    assert.equal(await page.evaluate(() => window.__captureOptions.audio), false)
    await capture.selectOption('audio')
    assert.equal(await page.evaluate(() => window.__captureOptions.audio), true)
    await capture.selectOption('voice')
    assert.equal(await page.getByRole('heading', { name: 'Record voice-over', exact: true }).isVisible(), true)
    await page.evaluate(() => { window.__allowCapture = true })
    await capture.selectOption('screen')
    await page.getByRole('button', { name: 'Stop & add to timeline', exact: true }).waitFor()
    assert.equal(await page.getByRole('alert').count(), 0)
    await page.getByRole('status').filter({ hasText: 'Recording 00:01' }).waitFor()
    await page.getByRole('button', { name: 'Stop & add to timeline', exact: true }).click()
    await capture.waitFor()
    assert.equal(await page.locator('.clip').count(), 1)
    for (const width of [800, 375]) {
      await page.setViewportSize({ width, height: 1000 })
      const rect = await capture.boundingBox()
      assert.ok(rect.x >= 0 && rect.x + rect.width <= width)
      assert.ok(rect.height >= 40)
    }
  })

  await t.test('built-in preset cards apply instantly with undo, previews, locks, reduced motion and contextual stock searches', async (t) => {
    const context = await browser.newContext({ viewport: { width: 1615, height: 1000 } })
    t.after(() => context.close())
    await context.addInitScript(() => {
      window.__videoTestAssets = [{
        id: 'image', name: 'Preset test image', type: 'image',
        previewUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>'),
      }]
    })
    const page = await context.newPage()
    await page.goto(url)
    const panels = page.getByRole('group', { name: 'Video tool panels' })
    await panels.getByRole('button', { name: 'Filters', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Noir', exact: true }).isDisabled(), true)
    await panels.getByRole('button', { name: 'Media', exact: true }).click()
    await page.getByRole('button', { name: 'Preset test image Tap to add', exact: true }).click()
    await page.locator('.clip').click()
    await panels.getByRole('button', { name: 'Filters', exact: true }).click()
    assert.equal(await page.getByRole('region', { name: 'Built-in filters' }).getByRole('button').count(), 19)
    await page.getByRole('button', { name: 'Noir', exact: true }).click()
    assert.match(await page.locator('.preview-image').getAttribute('style'), /grayscale\(100%\) contrast\(160%\)/)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    assert.doesNotMatch(await page.locator('.preview-image').getAttribute('style'), /grayscale/)
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await page.locator('.clip').click()
    await panels.getByRole('button', { name: 'Effects', exact: true }).click()
    assert.equal(await page.getByRole('region', { name: 'Built-in effects' }).getByRole('button').count(), 9)
    await page.getByRole('button', { name: 'Soft focus', exact: true }).click()
    assert.match(await page.locator('.preview-image').getAttribute('style'), /grayscale\(100%\).*blur\(2px\)/)
    await page.getByRole('button', { name: 'Neutral', exact: true }).click()
    await panels.getByRole('button', { name: 'Transitions', exact: true }).click()
    assert.equal(await page.getByRole('region', { name: 'Built-in transitions' }).getByRole('button').count(), 12)
    const reverse = page.getByRole('button', { name: 'Reverse slide', exact: true })
    await reverse.click()
    assert.match(await page.locator('.preview-image').getAttribute('style'), /translate\(100%, 0%\)/)
    await reverse.hover()
    assert.equal(await reverse.locator('.video-preset-scene').evaluate((element) => getComputedStyle(element).animationName), 'video-preset-slide')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    assert.equal(await reverse.locator('.video-preset-scene').evaluate((element) => getComputedStyle(element).animationName), 'none')
    await page.getByRole('button', { name: 'Wipe', exact: true }).click()
    assert.match(await page.locator('.preview-image').getAttribute('style'), /clip-path: inset\(0px 100% 0px 0px\)/)
    await page.getByTitle('Lock track', { exact: true }).first().click()
    assert.equal(await reverse.isDisabled(), true)
    await page.getByTitle('Unlock track', { exact: true }).first().click()
    for (const [panel, query] of [['Transitions', 'Transition'], ['Effects', 'Abstract'], ['Filters', 'Cinematic'], ['Text', 'Title'], ['Elements', 'Graphic']]) {
      await panels.getByRole('button', { name: panel, exact: true }).click()
      await page.getByRole('button', { name: 'Looking for something more?', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Stock library', exact: true })
      assert.equal(await dialog.getByLabel('Search the stock library').inputValue(), query)
      assert.equal(await dialog.getByRole('tab', { name: panel === 'Elements' ? 'Images' : 'Videos', exact: true }).getAttribute('aria-selected'), 'true')
      await dialog.getByRole('button', { name: 'Close stock library', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Stock library', exact: true }).click()
    assert.equal(await page.getByLabel('Search the stock library').inputValue(), 'Whoosh')
    await page.getByRole('button', { name: 'Close stock library', exact: true }).click()
    for (const width of [1615, 800, 375]) {
      await page.setViewportSize({ width, height: 1000 })
      await panels.getByRole('button', { name: 'Transitions', exact: true }).click()
      const rect = await page.getByRole('region', { name: 'Built-in transitions' }).boundingBox()
      assert.ok(rect.x >= 0 && rect.x + rect.width <= width)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: `/home/codespace/.copilot/session-state/b4bb868c-9596-4d47-a3d5-eac962444037/files/video-presets-${width}.png`, fullPage: true })
    }
  })

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
    await page.getByTitle('Unlock track', { exact: true }).first().click()
    await panels.getByRole('button', { name: 'Transitions', exact: true }).click()
    await page.getByRole('button', { name: 'Quick fade', exact: true }).click()
    await panels.getByRole('button', { name: 'Effects', exact: true }).click()
    await page.getByRole('button', { name: 'Punchy', exact: true }).click()
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
    assert.equal(exported.clips[0].transition, 'fade-fast')
    assert.equal(exported.clips[0].filter, 'mono')
    assert.equal(exported.clips[0].effects.contrast, 135)
    const encoded = (await readFile(await download.path())).toString('base64')
    const rendered = await page.evaluate(async (data) => {
      const video = document.createElement('video')
      video.muted = true
      const ready = new Promise((resolve, reject) => {
        video.onloadeddata = resolve
        video.onerror = () => reject(new Error('Exported WebM could not be decoded.'))
      })
      video.src = `data:video/webm;base64,${data}`
      await ready
      const seeked = new Promise((resolve) => { video.onseeked = resolve })
      video.currentTime = 2
      await seeked
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, 1, 1)
      const result = { width: video.videoWidth, height: video.videoHeight, pixel: [...ctx.getImageData(0, 0, 1, 1).data] }
      video.src = ''
      return result
    }, encoded)
    assert.equal(rendered.width, 1080)
    assert.equal(rendered.height, 1920)
    assert.ok(rendered.pixel[0] > 10, 'export contains rendered image, not a black frame')
    assert.ok(Math.abs(rendered.pixel[0] - rendered.pixel[1]) <= 3 && Math.abs(rendered.pixel[1] - rendered.pixel[2]) <= 3,
      'B&W filter is rendered into exported frames')
  })
})
