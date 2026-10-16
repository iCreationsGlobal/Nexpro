'use client'

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { ArrowRight, CirclePlay, Heart, MessageCircle, Star, UserRound, UsersRound, Smartphone, CheckCircle2 } from 'lucide-react'
import { CONTACT_EMAIL } from '@/lib/constants'
import { contributors } from './contributors'
import './community.css'

const categories = ['All', 'Vision & Encouragement', 'Product Feedback', 'Testing & Quality Assurance', 'Business Partners & Early Customers'] as const
type Category = typeof categories[number]
const categoryTones: Record<string, string> = {
  'Vision & Encouragement': 'orange',
  'Product Feedback': 'blue',
  'Testing & Quality Assurance': 'purple',
  'Business Partners & Early Customers': 'green',
}
const feedbackEmail = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('ABS Community Feedback')}&body=${encodeURIComponent('Hello ABS team,\n\nHere is my feedback on ABS:\n\nWhat works well: \nWhat could be better: \nIdeas for what to build next: \n')}`
const testerEmail = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('ABS Mobile Testing Community')}&body=${encodeURIComponent('Hello ABS team,\n\nI would like to join the ABS mobile testing community.\n\nName: \nBusiness (optional): \nPhone: \nDevice (iPhone or Android): \n\nPlease send me the appropriate download or testing instructions.\n')}`

function Portrait({ index, className = '' }: { index: number; className?: string }) {
  const style = { '--portrait-x': `${(index % 4) * 100 / 3}%`, '--portrait-y': index < 4 ? '0%' : '100%' } as CSSProperties
  return <div aria-hidden="true" className={`community-portrait ${className}`} style={style} />
}

export function CommunityPage() {
  const [category, setCategory] = useState<Category>('All')
  const visiblePeople = contributors.filter(person => category === 'All' || person.category === category)

  return (
    <main className="community-page">
      <section className="community-hero">
        <div className="community-hero-inner">
          <div className="community-hero-copy">
            <span className="community-eyebrow">ABS Community</span>
            <h1>Built with you.<br />For <span>every business.</span></h1>
            <p>ABS is more than a business management platform. It is a product shaped by real people, real businesses, honest feedback, and shared experiences.</p>
            <p>From our first customers to people who tested the platform, shared ideas, identified problems, or simply encouraged us to keep going, every contribution has helped shape our journey.</p>
            <p>We believe the best business tools are built by listening to the people who use them and the people they are designed to serve.</p>
            <p><strong>Thank you for being part of the ABS story.</strong></p>
            <div className="community-actions">
              <Link className="community-button" href="#mobile-testers">Join the Community <ArrowRight size={19} /></Link>
              <a className="community-button community-button-outline" href="#our-journey"><CirclePlay size={21} /> Explore Our Story</a>
            </div>
            <div className="community-social-proof">
              <div className="community-avatars">{[0, 1, 2, 3, 5].map(index => <Portrait key={index} index={index} />)}<span><Heart size={16} /></span></div>
              <p>Every conversation contributes<br />to the ABS journey.</p>
            </div>
          </div>
          <div className="community-collage" aria-label="Illustrative portraits of Ghanaian business owners">
            <Portrait index={3} className="collage-one" /><Portrait index={2} className="collage-two" /><Portrait index={1} className="collage-three" /><Portrait index={0} className="collage-four" /><Portrait index={7} className="collage-five" />
            <span className="community-speech">Real conversations.<br />Real businesses.</span>
            <span className="community-sticker sticker-ideas">Ideas.</span><span className="community-sticker sticker-feedback">Feedback</span><span className="community-sticker sticker-support">Support</span><span className="community-sticker sticker-better">A better ABS.</span>
            <span className="community-spark spark-one" aria-hidden="true">⌁</span><span className="community-spark spark-two" aria-hidden="true">⌁</span>
            <span className="community-illustration-note">Illustrative community portraits</span>
          </div>
        </div>
      </section>

      <div className="community-content">
        <section className="community-hall" aria-labelledby="hall-title">
          <div className="community-section-heading"><p className="community-kicker">Community hall of fame</p><h2 id="hall-title">The People Behind ABS</h2><p>Every contribution matters. Meet some of the people and businesses who have helped us improve ABS through their feedback, encouragement, testing, and trust.</p></div>
          <div className="community-filters" aria-label="Filter community members">{categories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)} className={category === item ? 'is-active' : ''}>{item}</button>)}</div>
          <div className="community-grid" aria-live="polite">{visiblePeople.map(person => <article key={person.name} className="community-card contributor-card">
            <div className={`contributor-identity identity-${categoryTones[person.category]}`}><span aria-hidden="true">{person.name.replace(/^(Madam|Mr\.|Dr\.)\s+/, '').split(' ').slice(0, 2).map(word => word[0]).join('')}</span><span className="contributor-topic">{person.role}</span></div>
            <div className="community-card-body"><h3>{person.name}</h3><p className="contributor-role">{person.role}</p><span className={`community-badge badge-${categoryTones[person.category]}`}>{person.category}</span><p className="contributor-story">{person.paragraphs[0]}</p><details><summary>Read their contribution</summary><div>{person.paragraphs.slice(1).map(paragraph => <p key={paragraph}>{paragraph}</p>)}<p className="contributor-thanks">{person.thanks}</p></div></details></div>
          </article>)}</div>
        </section>

        <section className="community-ideas" aria-labelledby="ideas-title">
          <div className="community-section-heading"><p className="community-kicker">Listening. Learning. Improving.</p><h2 id="ideas-title">Every Idea Helps Us Improve</h2></div>
          <div className="community-prose"><p>The feedback we receive helps us understand the real challenges businesses face every day.</p><p>From inventory management and accounting to printing, invoicing, data protection, and customer communication, each contribution helps us see where we can do better.</p><p>We may not always get everything right the first time, but we believe in listening, learning, and improving.</p><p><strong>That is how we intend to build ABS: one conversation, one idea, and one improvement at a time.</strong></p></div>
        </section>

        <section className="community-stats" aria-label="Community goals">
          {[{ Icon: UserRound, title: 'Real people', text: 'Every contribution matters' }, { Icon: MessageCircle, title: 'Honest feedback', text: 'Learning from your experience' }, { Icon: Star, title: 'Shared ideas', text: 'Helping us see where we can do better' }, { Icon: Heart, title: '1 Goal', text: 'A better future for businesses in Ghana and Africa' }].map(({ Icon, title, text }) => <div key={title}><Icon size={38} strokeWidth={1.7} /><div><h3>{title}</h3><p>{text}</p></div></div>)}
        </section>

        <section id="our-journey" className="community-journey" aria-labelledby="journey-title">
          <div className="community-section-heading"><h2 id="journey-title">Our Journey Together</h2><p>Every conversation, idea and feedback moves ABS forward.</p></div>
          <ol className="community-timeline">{[{ title: 'March 2026', text: 'The ABS journey began' }, { title: 'Listening', text: 'Early feedback and testing' }, { title: 'Building', text: 'First businesses signed up' }, { title: 'Improving', text: 'New features based on your ideas' }, { title: 'Today', text: 'A growing community of amazing people' }].map((step, index) => <li key={`${step.title}-${index}`}><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
        </section>

        <section id="mobile-testers" className="community-testers" aria-labelledby="testers-title">
          <div className="community-tester-intro"><span className="community-eyebrow"><Smartphone size={15} /> ABS Mobile Is Live — Become a Tester</span><h2 id="testers-title">Help Us Make ABS Better</h2><p>The ABS mobile app is now live, and we want more people to experience it, explore its features, and help us improve it.</p><p>We are inviting business owners, entrepreneurs, existing users, and technology enthusiasts to join our mobile app testing community.</p><p>You do not have to be a developer or an existing customer. If you are willing to explore the app and share honest feedback, we want to hear from you.</p></div>
          <div className="community-testing-tasks"><h3>What Can You Help Us With?</h3>{[{ title: 'Test the features.', text: 'Explore the available tools and try the tasks that matter to you.' }, { title: 'Find problems.', text: 'Let us know when something does not work as expected.' }, { title: 'Share your experience.', text: 'Tell us what is easy, what is confusing, and what you would like to see improved.' }, { title: 'Help us understand businesses better.', text: 'Your experience could help us identify needs we have not yet considered.' }].map(task => <div key={task.title}><CheckCircle2 size={21} /><p><strong>{task.title}</strong> {task.text}</p></div>)}</div>
          <div className="community-tester-register"><h3>Become Part of the Testing Community</h3><p>Your feedback can help us make ABS more useful, reliable, and easier to use for businesses.</p><a className="community-button" href={testerEmail}>Become an ABS Mobile Tester <ArrowRight size={19} /></a><p className="community-testing-note">Register by email. We will provide the appropriate download or testing instructions when you register.</p></div>
        </section>

        <section className="community-feedback" aria-labelledby="voice-title"><div className="community-feedback-photos" aria-hidden="true">{[0, 3, 2, 7].map(index => <Portrait key={index} index={index} />)}</div><div className="community-feedback-copy"><span className="community-feedback-icon"><UsersRound size={25} /></span><h2 id="voice-title">Your Voice Matters Too</h2><h3>You Don’t Have to Be an ABS Customer to Contribute</h3><p>Have you ever reviewed ABS, shared an idea, pointed out a problem, tested a feature, or encouraged us to keep going?</p><p>Perhaps you considered using ABS but decided it was not right for your business. Even that experience can teach us something valuable.</p><p>We welcome honest opinions, suggestions, questions, and ideas from everyone.</p><p>You do not have to buy a plan or become a customer before your voice matters to us.</p><h3>Share Your Feedback</h3><p>Tell us what you think ABS does well, what could be better, or what you would like us to build next.</p><a className="community-button" href={feedbackEmail}>Share Your Feedback <ArrowRight size={19} /></a></div></section>

        <section className="community-thank-you" aria-labelledby="thanks-title"><Heart size={30} /><h2 id="thanks-title">Thank You for Being Part of Our Story</h2><div className="community-prose"><p>ABS is being built for businesses, but our journey has been shaped by people.</p><p>To everyone who gave us feedback, tested our platform, trusted us with their business, shared an idea, or encouraged us along the way: thank you.</p><p>Every contribution has helped us learn something, see a problem differently, or discover a better way forward.</p><p>We are still learning, still improving, and still building.</p><p>And we are glad to have you as part of the journey.</p><p><strong>ABS Ghana — Built With You. For Every Business.</strong></p></div></section>

      </div>
    </main>
  )
}
