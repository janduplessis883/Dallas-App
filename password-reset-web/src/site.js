import './site.css';

const navToggle = document.querySelector('[data-nav-toggle]');
const navLinks = document.querySelector('[data-nav-links]');
const progressBar = document.querySelector('[data-scroll-progress]');
const revealItems = document.querySelectorAll('[data-reveal]');
const buildMeter = document.querySelector('[data-build-meter]');
const moduleButtons = document.querySelectorAll('[data-module]');
const moduleTitle = document.querySelector('[data-module-title]');
const moduleCopy = document.querySelector('[data-module-copy]');
const privacyTabs = document.querySelectorAll('[data-privacy-tab]');
const privacyPanels = document.querySelectorAll('[data-privacy-panel]');

const moduleContent = {
  recovery: {
    copy:
      'Capture high-risk situations, personal vision, coping steps, and accountability notes in one living recovery plan.',
    title: 'Recovery planning',
  },
  assistant: {
    copy:
      'Use guided AI support and recovery assistant prompts for structured reflection, planning, and next-step thinking.',
    title: 'Recovery assistant',
  },
  accountability: {
    copy:
      'Add accountability partners, schedule planned check-ins, send partner reply links, and connect with Dallas App Buddies.',
    title: 'Accountability',
  },
  buddies: {
    copy:
      'Connect with other Dallas users through Dallas App Buddies, use in-app chat, see unread messages, and receive notification-supported check-ins.',
    title: 'Dallas App Buddies',
  },
  events: {
    copy:
      'Prepare before stressful events, set anchors for the moment itself, and debrief what worked afterwards.',
    title: 'Event planning',
  },
  vision: {
    copy:
      'Write short and long Prophetic Vision entries, keep cover and audio files, and rewrite reflections when useful.',
    title: 'Prophetic Vision',
  },
  reminders: {
    copy:
      'Manage local notification schedules, recovery prompts, and check-in reminders from the app settings.',
    title: 'Reminders',
  },
};

navToggle?.addEventListener('click', () => {
  const expanded = navToggle.getAttribute('aria-expanded') === 'true';

  navToggle.setAttribute('aria-expanded', String(!expanded));
  navLinks?.classList.toggle('is-open', !expanded);
});

navLinks?.addEventListener('click', (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    navToggle?.setAttribute('aria-expanded', 'false');
    navLinks.classList.remove('is-open');
  }
});

moduleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.getAttribute('data-module');
    const nextContent = key ? moduleContent[key] : null;

    if (!nextContent || !moduleTitle || !moduleCopy) {
      return;
    }

    moduleButtons.forEach((item) => item.classList.toggle('is-active', item === button));
    moduleTitle.textContent = nextContent.title;
    moduleCopy.textContent = nextContent.copy;
  });
});

privacyTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const key = tab.getAttribute('data-privacy-tab');

    privacyTabs.forEach((item) => item.classList.toggle('is-active', item === tab));
    privacyPanels.forEach((panel) => {
      panel.hidden = panel.getAttribute('data-privacy-panel') !== key;
    });
  });
});

function updateScrollProgress() {
  if (!progressBar) {
    return;
  }

  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;

  progressBar.style.transform = `scaleX(${Math.min(Math.max(progress, 0), 1)})`;
}

function updateBuildMeter() {
  if (!buildMeter) {
    return;
  }

  const section = document.querySelector('#build');

  if (!section) {
    return;
  }

  const rect = section.getBoundingClientRect();
  const visible = window.innerHeight - rect.top;
  const progress = Math.min(Math.max(visible / (rect.height + window.innerHeight * 0.3), 0), 1);

  buildMeter.style.setProperty('--meter', `${Math.round(progress * 100)}%`);
}

const revealObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.16 })
  : null;

revealItems.forEach((item) => {
  if (revealObserver) {
    revealObserver.observe(item);
  } else {
    item.classList.add('is-visible');
  }
});

window.addEventListener('scroll', () => {
  updateScrollProgress();
  updateBuildMeter();
}, { passive: true });

updateScrollProgress();
updateBuildMeter();
