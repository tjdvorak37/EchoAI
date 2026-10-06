import test from 'node:test'
import assert from 'node:assert/strict'
import { PHOTO_EDITOR_TRAINING } from './photoEditorTraining.js'
import { HELP_ARTICLES, HELP_CATEGORIES } from './helpArticles.js'
import { PHOTO_EDITOR_TEMPLATES } from './templateCatalog.js'

test('mode-specific training has distinct identities and valid prepared practices', () => {
  assert.equal(new Set(PHOTO_EDITOR_TRAINING.map((lesson) => lesson.id)).size, PHOTO_EDITOR_TRAINING.length)
  for (const mode of ['simple', 'classic']) {
    assert.ok(PHOTO_EDITOR_TRAINING.filter((lesson) => lesson.workspace === mode).length >= 3)
  }
  for (const lesson of PHOTO_EDITOR_TRAINING) {
    assert.ok(lesson.id.startsWith(`${lesson.workspace}-`))
    assert.ok(lesson.title.startsWith(`${lesson.workspace === 'simple' ? 'Simple' : 'Classic'}:`))
    assert.ok(lesson.steps.length >= 6)
    assert.ok(lesson.notes.length > 0)
    assert.ok(PHOTO_EDITOR_TEMPLATES.some((template) => template.key === lesson.practice.templateKey))
    assert.ok(lesson.practice.checklist.length >= 3)
  }
})

test('knowledge base uses the same instructions in separate Simple and Classic categories', () => {
  assert.equal(new Set(HELP_ARTICLES.map((article) => article.id)).size, HELP_ARTICLES.length)
  for (const lesson of PHOTO_EDITOR_TRAINING) {
    const article = HELP_ARTICLES.find((article) => article.id === lesson.id)
    const category = `Photo Editor - ${lesson.workspace === 'simple' ? 'Simple' : 'Classic'}`
    assert.ok(HELP_CATEGORIES.includes(category))
    assert.equal(article.category, category)
    assert.deepEqual(article.steps, lesson.steps)
    assert.deepEqual(article.notes, lesson.notes)
  }
})
