const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')

const outputPath = path.join(__dirname, 'EchoAI-trademark-review-package.pdf')
const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true })
const stream = fs.createWriteStream(outputPath)
doc.pipe(stream)

const colors = { ink: '#18212B', muted: '#5B6672', accent: '#2364D8', line: '#D8DEE5', pale: '#F3F6F9' }
const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right

function heading(text, size = 16) {
  doc.moveDown(0.8).fillColor(colors.accent).font('Helvetica-Bold').fontSize(size).text(text)
  doc.moveTo(doc.x, doc.y + 5).lineTo(doc.page.width - doc.page.margins.right, doc.y + 5).strokeColor(colors.line).stroke()
  doc.moveDown(0.35)
}

function paragraph(text, options = {}) {
  doc.fillColor(options.color || colors.ink).font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size || 10).text(text, { width: contentWidth, lineGap: 2 })
  doc.moveDown(0.25)
}

function bullet(text) {
  doc.fillColor(colors.ink).font('Helvetica').fontSize(10).text(`- ${text}`, { width: contentWidth - 12, indent: 12, lineGap: 2 })
  doc.moveDown(0.1)
}

function field(label, value) {
  doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(9).text(label.toUpperCase())
  doc.fillColor(colors.ink).font('Helvetica').fontSize(10).text(value, { lineGap: 2 })
  doc.moveDown(0.18)
}

doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(25).text('EchoAI')
doc.fillColor(colors.accent).font('Helvetica-Bold').fontSize(15).text('Trademark Submission Review Package')
doc.moveDown(0.4)
paragraph('Pre-filing evidence package | Prepared September 12, 2026', { color: colors.muted })
paragraph('This is an organized review document, not a completed government application or legal opinion. A trademark attorney should confirm clearance, ownership, specimens, classifications, and filing dates before submission.', { color: colors.muted })

heading('Applicant')
field('Legal owner / applicant', 'Timothy Jason Dvorak')
field('Applicant type', 'Individual')
field('Address', '314 Arthur Neu Dr.\nCarroll, Iowa 51401\nUnited States of America')
field('Email', 'tdvorak37@gmail.com')
field('Phone', '712-790-7445')
field('Filing jurisdiction', 'United States of America')
field('Website', 'https://www.echoaipro.com')
field('Current availability', 'Private beta testing; not live for general public use')
field('First-use dates', 'Private beta testing only; dates to confirm. Public commercial use is not yet confirmed.')

heading('Candidate Marks')
paragraph('Primary word mark: EchoAI', { bold: true })
paragraph('Logo / composite mark: EchoAI wordmark paired with the Echo mascot', { bold: true })
paragraph('Possible product labels requiring separate legal review:')
;['AI Studio', 'In-house AI', 'Photo + video', 'Publish', 'Listen', 'Workspace'].forEach(bullet)
paragraph('Product labels are not automatically separate trademarks. Generic feature names should not be filed merely because they appear in navigation or marketing copy.', { color: colors.muted })

heading('Visual Assets and Specimens')
const assets = [
  ['src/assets/echo-mascot.svg', 'Primary mascot/logo artwork', 'Confirm ownership and final version'],
  ['public/favicon.svg', 'Site icon', 'Supporting evidence only'],
  ['src/assets/demo-poster.svg', 'Service specimen', 'Use only if displayed to customers'],
  ['src/assets/hero.png', 'Website visual', 'Confirm source and license'],
  ['public/icons.svg', 'UI icon sprite', 'Exclude unless independently brand-specific'],
  ['src/assets/react.svg', 'Third-party framework asset', 'Exclude'],
  ['src/assets/vite.svg', 'Third-party build asset', 'Exclude'],
]
assets.forEach(([file, role, action]) => {
  doc.fillColor(colors.pale).roundedRect(doc.x, doc.y, contentWidth, 39, 3).fill()
  doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(9).text(file, doc.x + 8, doc.y + 6)
  doc.fillColor(colors.muted).font('Helvetica').fontSize(8.5).text(`${role} | ${action}`, doc.x + 8, doc.y + 21)
  doc.moveDown(0.55)
})
paragraph('Capture dated screenshots of the live HTTPS site showing EchoAI used with the offered services, including the URL and capture date. Preserve source and license records for submitted artwork.', { color: colors.muted })

doc.addPage()
heading('Services Described by the Site')
;[
  'AI-assisted creation of copy, documents, images, video, audio, characters, and media analysis',
  'Editing and transformation of photos and video',
  'Storage and organization of workspace files and brand assets',
  'Scheduling and publishing content to connected social channels',
  'Audience, competitor, trend, sentiment, and reputation monitoring',
  'Private AI-tool integration and model routing',
].forEach(bullet)

heading('Data and Intellectual Property')
paragraph('The application processes account information, workspace files, images, videos, documents, briefs, brand assets, prompts, generated content, scheduled posts, connected-service identifiers, OAuth tokens, support details, and technical usage information.')
paragraph('These are not trademark assets and must not be placed in a public submission package. Do not include customer records, personal information, workspace uploads, OAuth credentials, API keys, recovery codes, database exports, or production logs. Use redacted fictional examples if needed.')

heading('Related Records to Assemble')
;[
  'Copyright ownership records for original code, copy, artwork, and database structure',
  'Contributor and contractor IP assignment agreements',
  'Licenses and invoices for fonts, stock media, icons, templates, and AI-generated assets',
  'Trade-secret access policy for private prompts, routing rules, datasets, and credentials',
  'Privacy policy, terms of service, and data-processing agreements',
  'Domain registration and business-formation records',
].forEach(bullet)

heading('US Filing Checklist')
;[
  'Complete and verify applicant legal details and correspondence information',
  'Confirm the filing basis and exact first-use dates',
  'Run clearance searches for identical and confusingly similar marks',
  'Confirm ownership and licenses for every submitted image and specimen',
  'Capture current dated screenshots from the live site',
  'Choose one consistent primary mark and logo version',
  'Confirm goods/services classes with counsel; likely areas may include Class 42 for hosted SaaS, Class 9 for downloadable software if actually offered, and Class 35 for qualifying marketing services',
  'File the application and monitor office actions, deadlines, and renewals',
].forEach(bullet)

heading('Open Items')
;[
  'Confirm first-use dates for EchoAI and whether beta access qualifies for the selected filing basis',
  'Confirm whether Timothy Jason Dvorak owns all software, artwork, copy, and submitted assets',
  'Add any business entity information if the mark will be owned by a company instead of the individual',
  'Have a US trademark attorney review the final application and specimens',
].forEach(bullet)

doc.flushPages()
doc.end()
stream.on('finish', () => console.log(`Created ${outputPath}`))