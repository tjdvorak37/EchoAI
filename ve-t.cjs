const { chromium } = require('playwright')

;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } })
  p.on('pageerror', (e) => console.log('pageerror', e.message))
  p.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 200)))
  await p.route('**/functions/v1/media-library', async (route) => {
    const body = route.request().postDataJSON()
    console.log('route', JSON.stringify(body).slice(0, 120))
    const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(body.query)}&license=cc0&page_size=12`)
    const data = await res.json()
    const items = data.results.map((r) => ({ id: `image-${r.id}`, kind: 'image', title: r.title || 'image', creator: r.creator, thumbnail: r.thumbnail, url: r.url, width: r.width, height: r.height, type: 'photo', license: 'test' }))
    return route.fulfill({ json: { configured: true, items, hasMore: true } })
  })
  await p.goto('http://localhost:5198/ve-h.html')
  await p.waitForSelector('.photo-stock-chip', { timeout: 20000 })
  await p.locator('.photo-stock-chip').click()
  for (let i = 0; i < 8; i += 1) {
    await p.waitForTimeout(700)
    console.log(i, await p.evaluate(() => ({ drawer: !!document.querySelector('.stock-library'), cards: document.querySelectorAll('.stock-image-card').length, loading: !!document.querySelector('.stock-library-loading'), err: document.querySelector('.stock-library-error')?.textContent })))
  }
  await b.close()
})()
