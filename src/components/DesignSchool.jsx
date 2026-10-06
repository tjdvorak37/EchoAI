import { useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, Clock, GraduationCap, Home, Image as ImageIcon, LayoutTemplate, Play } from 'lucide-react'
import echoTools from '../assets/echo-poses/echo-ai-tools.png'
import echoCreator from '../assets/echo-poses/echo-creator-mode.png'
import echoPhoto from '../assets/echo-poses/echo-photo-editor.png'
import echoSocial from '../assets/echo-poses/echo-social-media.png'
import echoScheduler from '../assets/echo-poses/echo-scheduler.png'
import echoModern from '../assets/echo-poses/echo-modern-friendly.png'
import { PHOTO_EDITOR_TRAINING } from '../data/photoEditorTraining'
import './DesignSchool.css'

const GENERAL_DESIGN_COURSES = [
  {
    id: 'design-foundations',
    track: 'Design foundations',
    title: 'Build a clear visual hierarchy',
    summary: 'Guide attention with scale, spacing, alignment, and contrast.',
    level: 'Beginner',
    minutes: 8,
    image: echoCreator,
    color: '#0f766e',
    steps: [
      'Choose one message as the focal point. Make it the largest element on the canvas.',
      'Group related details and separate unrelated details with consistent spacing.',
      'Align text and objects to a shared edge so the composition feels intentional.',
      'Reduce or remove anything that competes with the primary message.',
    ],
    exercise: 'Open a social template and make the headline readable at thumbnail size.',
    practice: { templateKey: 'launch-signal', tool: 'select', activeLayerId: 'headline', checklist: ['Resize the headline so it leads the composition.', 'Align the headline and subcopy to the same edge.', 'Hide one nonessential accent and compare the result.'] },
  },
  {
    id: 'type-that-works',
    track: 'Typography',
    title: 'Make type readable and expressive',
    summary: 'Pair type, control line length, and create dependable text contrast.',
    level: 'Beginner',
    minutes: 10,
    image: echoModern,
    color: '#be123c',
    steps: [
      'Use one display style for headlines and one quieter style for supporting copy.',
      'Keep text blocks short enough to scan without moving the eye too far across the canvas.',
      'Use weight and size before adding extra colors or decorative effects.',
      'Check text against every background area it overlaps, including photos.',
    ],
    exercise: 'Load Editorial Profile and rewrite its headline and subcopy using two clear levels.',
    practice: { templateKey: 'editorial-profile', tool: 'select', activeLayerId: 'headline', checklist: ['Rewrite the headline in six words or fewer.', 'Set supporting copy to a visibly smaller size.', 'Check both text layers against the background.'] },
  },
  {
    id: 'color-systems',
    track: 'Color',
    title: 'Create a useful color system',
    summary: 'Choose accessible roles for background, text, accents, and actions.',
    level: 'Beginner',
    minutes: 9,
    image: echoTools,
    color: '#7c3aed',
    steps: [
      'Start with a background color and a text color that have strong contrast.',
      'Choose one accent for emphasis instead of giving every element equal intensity.',
      'Repeat colors by role so users learn what each color means.',
      'Preview the design in grayscale to confirm hierarchy does not depend on hue alone.',
    ],
    exercise: 'Change a royalty-free template palette while preserving readable contrast.',
    practice: { templateKey: 'weekend-sale', tool: 'fill', activeLayerId: 'template-accent', checklist: ['Choose a new background color.', 'Use one accent color on the template shape.', 'Confirm the headline remains easy to read.'] },
  },
  {
    id: 'photo-workflow',
    workspace: 'simple',
    track: 'Simple training',
    title: 'Simple: edit photos without losing control',
    summary: 'Use selections, masks, adjustments, and layers in a reversible workflow.',
    level: 'Intermediate',
    minutes: 14,
    image: echoPhoto,
    color: '#0369a1',
    steps: PHOTO_EDITOR_TRAINING.find((lesson) => lesson.id === 'simple-photo-tools').steps,
    exercise: 'Choose a Pixabay image, remove its background, and export a transparent PNG.',
    practice: { templateKey: 'product-focus', tool: 'object-select', activeLayerId: 'headline', openStock: true, checklist: ['Choose a licensed stock image as the background.', 'Select the subject and add a layer mask.', 'Set the fill to transparent and export PNG.'] },
  },
  {
    id: 'social-formats',
    track: 'Social design',
    title: 'Adapt one idea across social formats',
    summary: 'Recompose a campaign for square, portrait, story, and landscape canvases.',
    level: 'Intermediate',
    minutes: 12,
    image: echoSocial,
    color: '#db2777',
    steps: [
      'Begin with the platform and placement, then choose the matching preset dimensions.',
      'Keep critical text and faces away from edges that platform controls may cover.',
      'Recompose the hierarchy for each aspect ratio instead of stretching the original.',
      'Review every export at its real posting size before publishing.',
    ],
    exercise: 'Turn Launch Signal into both an Instagram post and a story composition.',
    practice: { templateKey: 'story-countdown', tool: 'move', activeLayerId: 'headline', checklist: ['Reposition the headline inside the story safe area.', 'Keep important content away from the top and bottom edges.', 'Export and review at actual mobile size.'] },
  },
  {
    id: 'campaign-system',
    track: 'Workflow development',
    title: 'Develop a reusable campaign system',
    summary: 'Connect templates, brand choices, post copy, and scheduling into one workflow.',
    level: 'Intermediate',
    minutes: 15,
    image: echoScheduler,
    color: '#b45309',
    steps: [
      'Define the campaign goal, audience, message, and required placements before designing.',
      'Choose one template structure and apply approved brand colors, fonts, and imagery.',
      'Use a Post Creation framework to adapt the same message for each connected channel.',
      'Name project files consistently and schedule only after previewing every destination.',
    ],
    exercise: 'Build one visual and one post draft for a launch, then inspect all channel previews.',
    practice: { templateKey: 'launch-signal', tool: 'select', activeLayerId: 'headline', checklist: ['Adapt the headline to the campaign goal.', 'Apply approved brand colors and visual hierarchy.', 'Export the visual, then continue in Post Creation.'] },
  },
]

const DESIGN_SCHOOL_COURSES = [
  ...GENERAL_DESIGN_COURSES,
  ...PHOTO_EDITOR_TRAINING.map((lesson) => ({
    ...lesson, track: lesson.workspace === 'classic' ? 'Classic training' : 'Simple training',
    level: 'Beginner', image: echoPhoto, color: lesson.workspace === 'classic' ? '#7137e8' : '#0369a1',
  })),
]
const LEARNING_PATHS = { general: 'Design foundations', simple: 'Simple training', classic: 'Classic training' }

const readProgress = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem('echoai-design-school-progress') || '[]'))
  } catch {
    return new Set()
  }
}

export function DesignSchool({ initialCourseId = '', initialLearningPath = 'general', onHome, onTemplates, onStartPractice, onReturnToEditor }) {
  const [selectedCourse, setSelectedCourse] = useState(() => DESIGN_SCHOOL_COURSES.find((course) => course.id === initialCourseId) ?? null)
  const [learningPath, setLearningPath] = useState(() => DESIGN_SCHOOL_COURSES.find((course) => course.id === initialCourseId)?.workspace
    || (Object.hasOwn(LEARNING_PATHS, initialLearningPath) ? initialLearningPath : 'general'))
  const [completed, setCompleted] = useState(readProgress)

  const markComplete = (courseId) => {
    const next = new Set(completed).add(courseId)
    setCompleted(next)
    localStorage.setItem('echoai-design-school-progress', JSON.stringify([...next]))
  }

  const courses = DESIGN_SCHOOL_COURSES.filter((course) => (course.workspace || 'general') === learningPath)
  const completedCount = courses.filter((course) => completed.has(course.id)).length
  const progress = Math.round((completedCount / courses.length) * 100)

  return (
    <section className="photo-home design-school-shell">
      <aside className="photo-home-rail" aria-label="Photo editor navigation">
        <div className="photo-home-mark" aria-label="EchoAI Design School"><GraduationCap size={22} /></div>
        <nav>
          <button type="button" aria-label="Home" onClick={onHome}><Home size={19} /><span>Home</span></button>
          <button type="button" aria-label="Templates" onClick={onTemplates}><LayoutTemplate size={19} /><span>Templates</span></button>
          <button type="button" className="active" aria-label="Design School"><GraduationCap size={19} /><span>School</span></button>
          <button type="button" aria-label="Start guided practice" onClick={() => setSelectedCourse(courses[0])}><ImageIcon size={19} /><span>Practice</span></button>
        </nav>
      </aside>

      <main className="design-school-main">
        {onReturnToEditor && <button type="button" className="design-school-back" onClick={onReturnToEditor}><ArrowLeft size={17} /> Return to current design</button>}
        <nav className="design-learning-paths" aria-label="Tutorial learning paths">
          {Object.entries(LEARNING_PATHS).map(([path, label]) => <button key={path} type="button" aria-pressed={learningPath === path} onClick={() => { setLearningPath(path); setSelectedCourse(null) }}>{label}</button>)}
        </nav>
        <p className="design-path-description">{learningPath === 'general' ? 'General design skills. Choose a separate training path for tool locations in your editor mode.'
          : `${LEARNING_PATHS[learningPath]} only: these instructions use the ${learningPath === 'classic' ? 'Classic icon toolbox and top bars' : 'Simple guided left panels'}. Prepared practice opens in this mode.`}</p>
        {selectedCourse ? (
          <article className="design-lesson">
            <button type="button" className="design-school-back" onClick={() => setSelectedCourse(null)}><ArrowLeft size={17} /> All lessons</button>
            <div className="design-lesson-hero" style={{ '--course-color': selectedCourse.color }}>
              <img src={selectedCourse.image} alt="" />
              <div><span>{selectedCourse.track}</span><h1>{selectedCourse.title}</h1><p>{selectedCourse.summary}</p><small><Clock size={14} /> {selectedCourse.minutes} min · {selectedCourse.level}</small></div>
            </div>
            <div className="design-lesson-content">
              <section>
                <h2>Lesson</h2>
                <ol>{selectedCourse.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                {selectedCourse.notes?.map((note) => <p key={note}>{note}</p>)}
              </section>
              <aside>
                <BookOpen size={24} />
                <h3>Practice in EchoAI</h3>
                <p>{selectedCourse.exercise}</p>
                <p>Prepared practice replaces the current editor document with a training template. Save an editable project copy first, or return to your current design without starting practice.</p>
                <button type="button" onClick={() => onStartPractice(selectedCourse)}>Start prepared project <ArrowRight size={16} /></button>
                <button type="button" className={completed.has(selectedCourse.id) ? 'completed' : ''} onClick={() => markComplete(selectedCourse.id)}><Check size={16} /> {completed.has(selectedCourse.id) ? 'Lesson completed' : 'Mark complete'}</button>
              </aside>
            </div>
          </article>
        ) : (
          <>
            <header className="design-school-hero">
              <div><span><GraduationCap size={17} /> EchoAI Design School</span><h1>Learn design by making.</h1><p>Short, practical lessons for stronger visuals and a faster EchoAI workflow.</p></div>
              <img src={echoCreator} alt="EchoAI creator working through a design lesson" />
            </header>
            <div className="design-school-progress"><div><strong>{LEARNING_PATHS[learningPath]} progress</strong><span>{completedCount} of {courses.length} lessons</span></div><progress value={completedCount} max={courses.length}>{progress}%</progress><b>{progress}%</b></div>
            <section className="design-course-section">
              <div className="design-course-heading"><div><span>Learning paths</span><h2>Build skills that transfer to every project</h2></div><button type="button" onClick={onTemplates}>Practice with templates <ArrowRight size={16} /></button></div>
              <div className="design-course-grid">
                {courses.map((course) => (
                  <button key={course.id} type="button" className="design-course-card" onClick={() => setSelectedCourse(course)} style={{ '--course-color': course.color }}>
                    <span className="design-course-image"><img src={course.image} alt="" /><i>{completed.has(course.id) ? <Check size={15} /> : <Play size={15} />}</i></span>
                    <span className="design-course-copy"><small>{course.track}</small><strong>{course.title}</strong><em>{course.summary}</em><b><Clock size={13} /> {course.minutes} min · {course.level}</b></span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </section>
  )
}