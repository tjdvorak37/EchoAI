import test from 'node:test'
import assert from 'node:assert/strict'
import { ECHOAI_TEMPLATE_LICENSE, PHOTO_EDITOR_TEMPLATES, POST_COMPOSER_TEMPLATES } from './templateCatalog.js'

const assertLicensedCatalog = (templates) => {
  assert.equal(new Set(templates.map((template) => template.key)).size, templates.length, 'template keys must be unique')
  for (const template of templates) {
    assert.equal(template.source, 'EchoAI original', `${template.key} source`)
    assert.equal(template.license, ECHOAI_TEMPLATE_LICENSE, `${template.key} license`)
    assert.match(template.license.summary, /personal and commercial/i, `${template.key} usage rights`)
  }
}

test('every selectable template has explicit royalty-free provenance', () => {
  assertLicensedCatalog(PHOTO_EDITOR_TEMPLATES)
  assertLicensedCatalog(POST_COMPOSER_TEMPLATES)
})

test('photo templates meet editable canvas requirements', () => {
  for (const template of PHOTO_EDITOR_TEMPLATES) {
    assert.ok(template.width >= 40 && template.width <= 8192, `${template.key} width`)
    assert.ok(template.height >= 40 && template.height <= 8192, `${template.key} height`)
    assert.equal(template.colors.length, 3, `${template.key} palette`)
    assert.ok(template.headline && template.subcopy && template.accentShape, `${template.key} editable content`)
  }
})

test('post templates provide editable copy, visual direction, and publishing targets', () => {
  for (const template of POST_COMPOSER_TEMPLATES) {
    assert.ok(template.message.includes('['), `${template.key} editable placeholders`)
    assert.ok(template.imageIdea, `${template.key} visual direction`)
    assert.ok(template.channels.length > 0, `${template.key} channels`)
  }
})