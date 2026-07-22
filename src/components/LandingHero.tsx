import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  Clock3,
  FileText,
  Highlighter,
  Layers3,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import styles from './LandingHero.module.css';

const PDF_LINES = [88, 96, 78, 92, 84, 64, 91, 76, 94, 69];

export function ProductPreview() {
  return (
    <div className={styles.productWrap} aria-label="StudySync workspace preview">
      <div className={styles.productGlow} />
      <div className={styles.browserFrame}>
        <div className={styles.browserBar}>
          <span className={styles.browserDots}><i /><i /><i /></span>
          <div className={styles.browserAddress}>studysync.app/workspace</div>
          <span className={styles.liveBadge}><i /> Synced</span>
        </div>

        <div className={styles.workspaceTopbar}>
          <div className={styles.workspaceBrand}><BookOpen size={13} /> StudySync</div>
          <div className={styles.workspaceTab}><FileText size={11} /> Neuroscience.pdf</div>
          <div className={styles.activityMini}><Clock3 size={11} /> Studied 28 min today</div>
        </div>

        <div className={styles.workspaceBody}>
          <div className={styles.workspaceRail}>
            <span className={styles.railActive}><FileText size={13} /></span>
            <span title="Flashcards"><Layers3 size={13} /></span>
            <span title="Study groups"><Users size={13} /></span>
            <span title="AI assistant"><Sparkles size={13} /></span>
          </div>

          <div className={styles.pageStrip}>
            <strong>Pages</strong>
            {[1, 2, 3].map((page) => (
              <div key={page} className={page === 1 ? styles.pageThumbActive : styles.pageThumb}>
                <i />
                <i />
                <i />
                <small>{page}</small>
              </div>
            ))}
          </div>

          <div className={styles.pdfStage}>
            <div className={styles.pdfToolbar}>
              <span>Chapter 4 · Memory Systems</span>
              <span><Highlighter size={11} /> 110%</span>
            </div>
            <div className={styles.pdfPaper}>
              <span className={styles.pdfKicker}>COGNITIVE NEUROSCIENCE</span>
              <h3>How memory becomes knowledge</h3>
              <p className={styles.pdfLead}>Encoding, consolidation, and retrieval work together to form durable memories.</p>
              <div className={styles.pdfRule} />
              {PDF_LINES.map((width, index) => (
                <span
                  key={`${width}-${index}`}
                  className={index === 2 || index === 3 ? styles.highlightLine : styles.pdfLine}
                  style={{ width: `${width}%` }}
                />
              ))}
              <div className={styles.marginNote}>Review before quiz</div>
            </div>
            <div className={styles.previewToolbar}>
              <FileText size={12} /><Highlighter size={12} /><MessageSquareText size={12} />
            </div>
          </div>

          <div className={styles.studyPanel}>
            <div className={styles.panelTabs}><span>Notes</span><span className={styles.panelTabActive}>AI Assistant</span></div>
            <div className={styles.aiPrompt}><Bot size={13} /> Explain this section simply</div>
            <div className={styles.aiAnswer}>
              <span><Sparkles size={11} /> StudySync AI</span>
              <p>Memory strengthens when new ideas connect to knowledge you already understand.</p>
            </div>
            <div className={styles.noteCard}>
              <strong>Page note</strong>
              <p>Compare consolidation with retrieval practice.</p>
            </div>
            <div className={styles.panelStats}>
              <span><Layers3 size={11} /> 24 flashcards</span>
              <span><Users size={11} /> 3 studying</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingHero() {
  return (
    <section className={styles.hero} aria-labelledby="landing-hero-title">
      <div className={styles.leftColumn}>
        <div className={styles.copy}>
          <div className={styles.eyebrow}><Sparkles size={14} /> One workspace for focused learning</div>
          <h1 id="landing-hero-title">
            Your PDFs, notes,<br />flashcards, and study groups<br />
            <span>in one place.</span>
          </h1>
          <p>
            Turn every document into an active study space. Read, annotate, organize,
            collaborate, and understand difficult material without switching apps.
          </p>
        </div>

        <div className={styles.visualStage}>
          <div className={styles.illustrationWrap}>
            <Image
              src="/landing/studysync-students.png"
              alt="Three students collaborating with a PDF, flashcards, and a laptop"
              width={1536}
              height={1024}
              priority
              sizes="(max-width: 760px) 92vw, (max-width: 1100px) 72vw, 48vw"
              className={styles.illustration}
            />
            <span className={`${styles.floatingTag} ${styles.tagPdf}`}><FileText size={12} /> PDF ready</span>
            <span className={`${styles.floatingTag} ${styles.tagRoom}`}><Users size={12} /> 3 friends online</span>
          </div>
          <ProductPreview />
        </div>

        <div className={styles.valueRow}>
          <span><Layers3 size={15} /> Notes & flashcards</span>
          <span><Users size={15} /> Live study rooms</span>
          <span><Bot size={15} /> AI study support</span>
          <span><ShieldCheck size={15} /> Your work, synced</span>
        </div>
      </div>

      <aside className={styles.authSide} aria-label="StudySync account access">
        <div className={styles.authGlow} />
        <div className={styles.authCard}>
          <div className={styles.cardLogo}><BookOpen size={20} /></div>
          <div className={styles.cardPill}>Your study space is ready</div>
          <h2>Study smarter from your next session.</h2>
          <p>Sign in to continue your work, or create a free account and add your first PDF.</p>

          <Link href="/login" className={styles.primaryAction}>
            Log in to StudySync <ArrowRight size={17} />
          </Link>
          <Link href="/register" className={styles.secondaryAction}>
            Create a free account
          </Link>

          <div className={styles.cardDivider}><span />Everything you need to begin<span /></div>
          <ul>
            <li><Check size={14} /> Upload and annotate PDFs</li>
            <li><Check size={14} /> Create notes and flashcards</li>
            <li><Check size={14} /> Join friends in live study rooms</li>
          </ul>
          <div className={styles.cardFoot}><ShieldCheck size={14} /> Secure account-based workspace</div>
        </div>
      </aside>
    </section>
  );
}
