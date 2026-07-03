/**
 * Kilani Diamond Reporter — Cinematic Continuous Walkthrough
 *
 * Coordinate system: all cursor/highlight positions are expressed as
 * percentages of the ORIGINAL screenshot (1536 × 768px).
 * At runtime, imgToStage() converts them to stage-relative percentages,
 * accounting for the actual rendered size of the stage.
 *
 * x% is identical in both spaces (image fills full width).
 * y% is scaled: stageY = imgY × (IMG_H / stage.clientHeight)
 */

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const IMG_W = 1536;
const IMG_H = 768;

// ── SCENE DATA ────────────────────────────────────────────────────────────────
// Events: t = ms from scene start, in image-% coords
// Docs for event types:
//   cursor  {t, x, y, speed?}           move cursor to image-space (x,y)
//   click   {t}                          trigger click animation
//   hl+     {t, id, x, y, w, h}         show highlight box in image-space
//   hl-     {t, id}                      hide highlight box
//   caption {t, tag, text}               update caption text

const SCENES = [

    // ── SCENE 1: Dashboard ─────────────────────────────────────────────────
    {
        img:   './demo/screens/01_dashboard.png',
        audio: './audio/demo_s01.mp3',
        tag:   'Overview · Dashboard',
        text:  'At a glance: requests, pending returns, live gold price, and every active project.',
        events: [
            { t: 400,   do: 'cursor',  x: 6,    y: 15.5 },             // sidebar overview
            { t: 1300,  do: 'cursor',  x: 25,   y: 23,   speed: 950 },  // → requests card
            { t: 1300,  do: 'hl+',     id: 'req', x: 12.5, y: 14.8, w: 22, h: 18 },
            { t: 4500,  do: 'hl-',     id: 'req'  },
            { t: 4500,  do: 'cursor',  x: 48.5, y: 23,   speed: 900 },  // → returns card
            { t: 4500,  do: 'hl+',     id: 'ret', x: 36,   y: 14.8, w: 22, h: 18 },
            { t: 7200,  do: 'hl-',     id: 'ret'  },
            { t: 7200,  do: 'cursor',  x: 70,   y: 23,   speed: 900 },  // → gold card
            { t: 7200,  do: 'hl+',     id: 'gld', x: 60,   y: 14.8, w: 22, h: 18 },
            { t: 10000, do: 'hl-',     id: 'gld'  },
            { t: 10000, do: 'cursor',  x: 47,   y: 51.5, speed: 1000 }, // → active projects
            { t: 10000, do: 'hl+',     id: 'proj', x: 18,   y: 38.5, w: 53, h: 23 },
            { t: 12500, do: 'hl-',     id: 'proj' },
            { t: 12800, do: 'cursor',  x: 76,   y: 9.2,  speed: 1100 }, // → new project btn
            { t: 13800, do: 'click' },
        ]
    },

    // ── SCENE 2: New Project Form ───────────────────────────────────────────
    {
        img:   './demo/screens/02_new_project.png',
        audio: './audio/demo_s02.mp3',
        tag:   'Create Project',
        text:  'Project code, client, piece name, gold spec, services and work instructions.',
        events: [
            { t: 200,   do: 'cursor',  x: 44,   y: 20,   speed: 600 }, // code field
            { t: 200,   do: 'hl+',     id: 'code',  x: 37,   y: 17.5, w: 25.5, h: 4.5 },
            { t: 200,   do: 'click' },
            { t: 3000,  do: 'hl-',     id: 'code' },
            { t: 3000,  do: 'cursor',  x: 63,   y: 20,   speed: 800 }, // piece name
            { t: 3000,  do: 'hl+',     id: 'pnm',   x: 51.5, y: 17.5, w: 25.5, h: 4.5 },
            { t: 5000,  do: 'hl-',     id: 'pnm'  },
            { t: 5000,  do: 'cursor',  x: 44,   y: 28,   speed: 750 }, // client name
            { t: 5000,  do: 'hl+',     id: 'cli',   x: 37,   y: 25,   w: 25.5, h: 4.5 },
            { t: 7000,  do: 'hl-',     id: 'cli'  },
            { t: 7000,  do: 'cursor',  x: 40,   y: 39,   speed: 800 }, // due date
            { t: 7000,  do: 'hl+',     id: 'due',   x: 37,   y: 35.9, w: 14,   h: 5.5 },
            { t: 8500,  do: 'hl-',     id: 'due'  },
            { t: 8500,  do: 'cursor',  x: 50,   y: 52,   speed: 900 }, // gold type buttons
            { t: 8500,  do: 'hl+',     id: 'mat',   x: 37,   y: 46.5, w: 39,   h: 17 },
            { t: 10500, do: 'hl-',     id: 'mat'  },
            { t: 10500, do: 'cursor',  x: 43,   y: 70,   speed: 950 }, // services
            { t: 10500, do: 'hl+',     id: 'svc',   x: 37,   y: 67.5, w: 39,   h: 6.5 },
            { t: 12500, do: 'hl-',     id: 'svc'  },
        ]
    },

    // ── SCENE 3: Project Detail (fresh CUST-0101) ───────────────────────────
    {
        img:   './demo/screens/03_project_detail.png',
        audio: './audio/demo_s03.mp3',
        tag:   'Project Detail',
        text:  'Design pipeline, diamond bags, cost tracking, gallery and activity log — all in one.',
        events: [
            { t: 300,   do: 'cursor',  x: 41,   y: 12,   speed: 600 }, // CUST-0101 title
            { t: 300,   do: 'hl+',     id: 'hdr',  x: 37,   y: 8.5,  w: 38,   h: 5.5 },
            { t: 2500,  do: 'hl-',     id: 'hdr'  },
            { t: 2500,  do: 'cursor',  x: 54,   y: 24,   speed: 900 }, // instructions box
            { t: 2500,  do: 'hl+',     id: 'ins',  x: 37,   y: 20.5, w: 35.5, h: 7 },
            { t: 5000,  do: 'hl-',     id: 'ins'  },
            { t: 5000,  do: 'cursor',  x: 39,   y: 30,   speed: 800 }, // team avatars
            { t: 5000,  do: 'hl+',     id: 'team', x: 37,   y: 28,   w: 6,    h: 4.5 },
            { t: 7000,  do: 'hl-',     id: 'team' },
            { t: 7000,  do: 'cursor',  x: 55,   y: 50,   speed: 1000 },// design pipeline
            { t: 7000,  do: 'hl+',     id: 'pip',  x: 37,   y: 39.5, w: 35.5, h: 14 },
            { t: 10000, do: 'hl-',     id: 'pip'  },
            { t: 10000, do: 'cursor',  x: 44,   y: 58,   speed: 800 }, // diamond bags tab
            { t: 10000, do: 'hl+',     id: 'dbt',  x: 37,   y: 56.5, w: 14,   h: 3.5 },
            { t: 10200, do: 'click' },
            { t: 12000, do: 'hl-',     id: 'dbt'  },
        ]
    },

    // ── SCENE 4: Design Pipeline (DR-1101 with full progress) ──────────────
    {
        img:   './demo/screens/09_project_progress.png',
        audio: './audio/demo_s04.mp3',
        tag:   'Design Pipeline',
        text:  'Six stages from Intake to Ready for Production — one click to advance, team notified instantly.',
        events: [
            { t: 300,   do: 'cursor',  x: 63,   y: 15,   speed: 700 }, // DR-1101 heading
            { t: 300,   do: 'hl+',     id: 'drt',  x: 51,   y: 13,   w: 28,   h: 5 },
            { t: 2800,  do: 'hl-',     id: 'drt'  },
            { t: 2800,  do: 'cursor',  x: 62,   y: 47,   speed: 1000 },// pipeline
            { t: 2800,  do: 'hl+',     id: 'pip',  x: 51,   y: 41.5, w: 28,   h: 13 },
            { t: 5500,  do: 'cursor',  x: 53,   y: 47,   speed: 600 }, // stage 1
            { t: 7500,  do: 'cursor',  x: 58,   y: 47,   speed: 600 }, // stage 2
            { t: 8800,  do: 'cursor',  x: 63,   y: 47,   speed: 600 }, // stage 3
            { t: 10000, do: 'cursor',  x: 68,   y: 47,   speed: 600 }, // stage 4
            { t: 11200, do: 'cursor',  x: 72.5, y: 47,   speed: 600 }, // stage 5
            { t: 12000, do: 'hl-',     id: 'pip'  },
        ]
    },

    // ── SCENE 5: All Projects ───────────────────────────────────────────────
    {
        img:   './demo/screens/04_all_projects.png',
        audio: './audio/demo_s05.mp3',
        tag:   'All Projects',
        text:  'Filter by Active, Review, or Closed. Search by code, client, or rep — instantly.',
        events: [
            { t: 400,   do: 'cursor',  x: 5.8,  y: 19.7, speed: 700 }, // sidebar
            { t: 1200,  do: 'cursor',  x: 42,   y: 15,   speed: 900 }, // search bar
            { t: 1200,  do: 'hl+',     id: 'srch', x: 35,   y: 13,   w: 28,   h: 4 },
            { t: 3200,  do: 'hl-',     id: 'srch' },
            { t: 3200,  do: 'cursor',  x: 55,   y: 15,   speed: 700 }, // filter tabs
            { t: 3200,  do: 'hl+',     id: 'flt',  x: 53,   y: 13,   w: 15,   h: 4 },
            { t: 5000,  do: 'hl-',     id: 'flt'  },
            { t: 5000,  do: 'cursor',  x: 56,   y: 23,   speed: 800 }, // DR-1101
            { t: 5000,  do: 'hl+',     id: 'dr1',  x: 35,   y: 19.5, w: 43,   h: 6.5 },
            { t: 7000,  do: 'hl-',     id: 'dr1'  },
            { t: 7000,  do: 'cursor',  x: 56,   y: 48,   speed: 900 }, // CUST-0101
            { t: 7000,  do: 'hl+',     id: 'cst',  x: 35,   y: 45.5, w: 43,   h: 6.5 },
            { t: 9500,  do: 'hl-',     id: 'cst'  },
        ]
    },

    // ── SCENE 6: Inventory Ledger ───────────────────────────────────────────
    {
        img:   './demo/screens/05_inventory.png',
        audio: './audio/demo_s06.mp3',
        tag:   'Inventory Ledger',
        text:  'Every diamond spec in the vault — pieces, carats, valuation. Every movement auto-logged.',
        events: [
            { t: 500,   do: 'cursor',  x: 5.8,  y: 24,   speed: 700 }, // sidebar inventory
            { t: 1300,  do: 'cursor',  x: 49,   y: 39,   speed: 1000 },// spec list
            { t: 1300,  do: 'hl+',     id: 'lst',  x: 35.5, y: 13,   w: 27,   h: 50 },
            { t: 3500,  do: 'cursor',  x: 49,   y: 24,   speed: 700 }, // RD 0.5mm
            { t: 3500,  do: 'hl-',     id: 'lst'  },
            { t: 3500,  do: 'hl+',     id: 'rd5',  x: 35.5, y: 22,   w: 27,   h: 3.5 },
            { t: 5500,  do: 'hl-',     id: 'rd5'  },
            { t: 5500,  do: 'cursor',  x: 49,   y: 56,   speed: 900 }, // RD 1mm
            { t: 5500,  do: 'hl+',     id: 'rd1',  x: 35.5, y: 53,   w: 27,   h: 3.5 },
            { t: 7500,  do: 'hl-',     id: 'rd1'  },
            { t: 7500,  do: 'cursor',  x: 71,   y: 34,   speed: 1000 },// global activity
            { t: 7500,  do: 'hl+',     id: 'act',  x: 64.5, y: 13,   w: 14.5, h: 46 },
            { t: 11000, do: 'hl-',     id: 'act'  },
        ]
    },

    // ── SCENE 7: Bulk Returns ───────────────────────────────────────────────
    {
        img:   './demo/screens/06_bulk_returns.png',
        audio: './audio/demo_s07.mp3',
        tag:   'Bulk Returns',
        text:  'Select the setter, add stone quantities — one click reconciles the entire run.',
        events: [
            { t: 400,   do: 'cursor',  x: 5.8,  y: 31.8, speed: 700 }, // sidebar bulk returns
            { t: 1200,  do: 'cursor',  x: 55,   y: 24,   speed: 900 }, // setter chips
            { t: 1200,  do: 'hl+',     id: 'set',  x: 40,   y: 19.5, w: 33,   h: 16.5 },
            { t: 4000,  do: 'hl-',     id: 'set'  },
            { t: 4000,  do: 'cursor',  x: 44,   y: 25,   speed: 600 }, // Harout
            { t: 4000,  do: 'click' },
            { t: 5000,  do: 'cursor',  x: 57,   y: 39,   speed: 900 }, // return items table
            { t: 5000,  do: 'hl+',     id: 'tbl',  x: 40,   y: 36.5, w: 33,   h: 47 },
            { t: 8500,  do: 'hl-',     id: 'tbl'  },
            { t: 8500,  do: 'cursor',  x: 69,   y: 73.6, speed: 1000 },// process intake btn
            { t: 8500,  do: 'hl+',     id: 'btn',  x: 63.5, y: 71.5, w: 15,   h: 5 },
            { t: 9000,  do: 'click' },
            { t: 11000, do: 'hl-',     id: 'btn'  },
        ]
    },

    // ── SCENE 8: Reports Hub ────────────────────────────────────────────────
    {
        img:   './demo/screens/07_reports_hub.png',
        audio: './audio/demo_s08.mp3',
        tag:   'Reports Hub',
        text:  'Complete timestamped audit trail — issues, returns, breakages. Export to CSV in one click.',
        events: [
            { t: 400,   do: 'cursor',  x: 5.8,  y: 36,   speed: 700 }, // sidebar reports hub
            { t: 1200,  do: 'cursor',  x: 48,   y: 12.5, speed: 900 }, // tabs
            { t: 1200,  do: 'hl+',     id: 'tabs', x: 35,   y: 11,   w: 36,   h: 4 },
            { t: 3200,  do: 'hl-',     id: 'tabs' },
            { t: 3200,  do: 'cursor',  x: 77,   y: 19.9, speed: 800 }, // export csv btn
            { t: 3200,  do: 'hl+',     id: 'exp',  x: 73.5, y: 18.5, w: 8,    h: 3.5 },
            { t: 3500,  do: 'click' },
            { t: 5000,  do: 'hl-',     id: 'exp'  },
            { t: 5000,  do: 'cursor',  x: 55,   y: 29,   speed: 950 }, // BROKEN_OUT row
            { t: 5000,  do: 'hl+',     id: 'r1',   x: 35,   y: 27,   w: 47,   h: 4 },
            { t: 7000,  do: 'hl-',     id: 'r1'   },
            { t: 7000,  do: 'cursor',  x: 55,   y: 33,   speed: 700 }, // ISSUE row
            { t: 7000,  do: 'hl+',     id: 'r2',   x: 35,   y: 31,   w: 47,   h: 4 },
            { t: 9000,  do: 'hl-',     id: 'r2'   },
        ]
    },

    // ── SCENE 9: Team ───────────────────────────────────────────────────────
    {
        img:   './demo/screens/08_team.png',
        audio: './audio/demo_s09.mp3',
        tag:   'Team Management',
        text:  'Assign roles, control access. Every person sees exactly what they need — nothing more.',
        events: [
            { t: 400,   do: 'cursor',  x: 5.8,  y: 40.6, speed: 700 }, // sidebar team
            { t: 1200,  do: 'cursor',  x: 71,   y: 8.3,  speed: 900 }, // add member btn
            { t: 1200,  do: 'hl+',     id: 'add',  x: 68.5, y: 6.8,  w: 9,    h: 4.5 },
            { t: 3200,  do: 'hl-',     id: 'add'  },
            { t: 3200,  do: 'cursor',  x: 46,   y: 23,   speed: 1000 },// team member grid
            { t: 3200,  do: 'hl+',     id: 'hk',   x: 37,   y: 19.5, w: 15,   h: 10.5 },// Hagop K
            { t: 5200,  do: 'hl-',     id: 'hk'   },
            { t: 5200,  do: 'cursor',  x: 63,   y: 23,   speed: 800 }, // yoyo
            { t: 5200,  do: 'hl+',     id: 'yo',   x: 50,   y: 19.5, w: 15,   h: 10.5 },
            { t: 7200,  do: 'hl-',     id: 'yo'   },
            { t: 7200,  do: 'cursor',  x: 71.5, y: 43,   speed: 900 }, // Harout setter
            { t: 7200,  do: 'hl+',     id: 'hr',   x: 64,   y: 38,   w: 15,   h: 10.5 },
            { t: 9500,  do: 'hl-',     id: 'hr'   },
            { t: 10500, do: 'cursor',  x: 50,   y: 50,   speed: 1200 },// centre
        ]
    },
];

// ── STATE ─────────────────────────────────────────────────────────────────────
let sceneIdx    = 0;
let isPlaying   = false;
let audio       = null;
let timers      = [];
let progressInt = null;
let activeHls   = {};

// ── ELEMENTS ──────────────────────────────────────────────────────────────────
const introEl      = document.getElementById('intro');
const playerEl     = document.getElementById('player');
const playBtnIntro = document.getElementById('play-btn');
const slidesEl     = document.getElementById('slides');
const hlLayerEl    = document.getElementById('hl-layer');
const cursorEl     = document.getElementById('cursor');
const hudChapterEl = document.getElementById('hud-chapter');
const captionTagEl = document.getElementById('caption-tag');
const captionTxtEl = document.getElementById('caption-text');
const dotsEl       = document.getElementById('dots');
const progressFill = document.getElementById('progress-fill');
const btnPP        = document.getElementById('btn-playpause');
const iconPlay     = document.getElementById('icon-play');
const iconPause    = document.getElementById('icon-pause');
const btnPrev      = document.getElementById('btn-prev');
const btnNext      = document.getElementById('btn-next');
const btnRestart   = document.getElementById('btn-restart');

// ── COORDINATE MAPPING ────────────────────────────────────────────────────────
// Converts image-space % → stage-space %
// x is the same; y is scaled by the visible crop factor
function stageCoords(imgX, imgY) {
    const sh = document.getElementById('stage').clientHeight;
    const sw = document.getElementById('stage').clientWidth;
    const scale = sw / IMG_W;         // image is scaled to fill stage width
    const dispH = IMG_H * scale;      // full displayed image height
    return {
        x: imgX,
        y: (imgY / 100 * dispH / sh) * 100
    };
}

// ── DOM BUILDING ──────────────────────────────────────────────────────────────
function buildSlides() {
    SCENES.forEach((s, i) => {
        const div = document.createElement('div');
        div.className = 'slide';
        div.dataset.scene = i;
        const img = document.createElement('img');
        img.className = 'slide-img';
        img.src = s.img;
        img.alt = s.tag;
        div.appendChild(img);
        slidesEl.appendChild(div);
    });
}

function buildDots() {
    SCENES.forEach((_, i) => {
        const d = document.createElement('div');
        d.className = 'dot';
        d.title = SCENES[i].tag;
        d.addEventListener('click', () => goTo(i, isPlaying));
        dotsEl.appendChild(d);
    });
}

function updateDots(i) {
    dotsEl.querySelectorAll('.dot').forEach((d, idx) =>
        d.classList.toggle('is-active', idx === i));
}

// ── CURSOR ────────────────────────────────────────────────────────────────────
function moveCursor(imgX, imgY, speed = 1100) {
    const { x, y } = stageCoords(imgX, imgY);
    cursorEl.style.transition =
        `left ${speed}ms cubic-bezier(0.25,0.46,0.45,0.94), ` +
        `top ${speed}ms cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.4s`;
    cursorEl.style.left = x + '%';
    cursorEl.style.top  = y + '%';
    cursorEl.classList.add('is-visible');
}

function clickCursor() {
    cursorEl.classList.remove('is-clicking');
    void cursorEl.offsetWidth;
    cursorEl.classList.add('is-clicking');
    setTimeout(() => cursorEl.classList.remove('is-clicking'), 400);
}

// ── HIGHLIGHTS ────────────────────────────────────────────────────────────────
function addHl(id, imgX, imgY, imgW, imgH_dim) {
    removeHl(id);
    const tl = stageCoords(imgX,          imgY);
    const br = stageCoords(imgX + imgW,   imgY + imgH_dim);
    const el = document.createElement('div');
    el.className = 'hl-box';
    el.id = 'hl_' + id;
    el.style.left   = tl.x + '%';
    el.style.top    = tl.y + '%';
    el.style.width  = (br.x - tl.x) + '%';
    el.style.height = (br.y - tl.y) + '%';
    hlLayerEl.appendChild(el);
    requestAnimationFrame(() => el.classList.add('hl-show'));
    activeHls[id] = el;
}

function removeHl(id) {
    const el = activeHls[id];
    if (!el) return;
    el.classList.remove('hl-show');
    setTimeout(() => { if (el.parentNode) el.remove(); }, 600);
    delete activeHls[id];
}

function clearAllHls() {
    Object.keys(activeHls).forEach(removeHl);
}

// ── CAPTION ───────────────────────────────────────────────────────────────────
function setCaption(tag, text) {
    captionTxtEl.classList.add('is-fading');
    setTimeout(() => {
        captionTagEl.textContent = tag;
        captionTxtEl.textContent = text;
        captionTxtEl.classList.remove('is-fading');
    }, 200);
}

// ── PROGRESS BAR ─────────────────────────────────────────────────────────────
function startProgress(durationMs) {
    stopProgress();
    progressFill.style.transition = 'none';
    progressFill.style.width = '0%';
    let elapsed = 0;
    const tick = 150;
    progressInt = setInterval(() => {
        elapsed += tick;
        const pct = Math.min((elapsed / durationMs) * 100, 100);
        progressFill.style.transition = `width ${tick}ms linear`;
        progressFill.style.width = pct + '%';
    }, tick);
}

function stopProgress() {
    if (progressInt) { clearInterval(progressInt); progressInt = null; }
}

// ── SCENE ENGINE ──────────────────────────────────────────────────────────────
function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
}

function scheduleEvents(events) {
    events.forEach(ev => {
        const t = setTimeout(() => {
            if (ev.do === 'cursor')  moveCursor(ev.x, ev.y, ev.speed);
            if (ev.do === 'click')   clickCursor();
            if (ev.do === 'hl+')     addHl(ev.id, ev.x, ev.y, ev.w, ev.h);
            if (ev.do === 'hl-')     removeHl(ev.id);
            if (ev.do === 'caption') setCaption(ev.tag, ev.text);
        }, ev.t);
        timers.push(t);
    });
}

function activateSlide(i) {
    slidesEl.querySelectorAll('.slide').forEach((s, idx) => {
        s.classList.toggle('is-active', idx === i);
        if (idx === i) {
            // restart KB animation
            const img = s.querySelector('.slide-img');
            img.style.animation = 'none';
            void img.offsetWidth;
            img.style.animation = '';
        }
    });
}

function goTo(i, autoPlay = false) {
    clearTimers();
    clearAllHls();
    stopProgress();

    sceneIdx = Math.max(0, Math.min(i, SCENES.length - 1));
    const scene = SCENES[sceneIdx];

    activateSlide(sceneIdx);
    updateDots(sceneIdx);
    hudChapterEl.textContent = `Chapter ${sceneIdx + 1} of ${SCENES.length}`;
    setCaption(scene.tag, scene.text);
    scheduleEvents(scene.events || []);

    if (autoPlay || isPlaying) {
        setPlaying(true);
        playAudio(scene);
    } else {
        progressFill.style.width = '0%';
    }
}

// ── AUDIO ─────────────────────────────────────────────────────────────────────
function stopAudio() {
    if (audio) { audio.pause(); audio.onended = null; audio = null; }
    stopProgress();
}

function playAudio(scene) {
    stopAudio();
    audio = new Audio(scene.audio);
    audio.addEventListener('loadedmetadata', () => startProgress(audio.duration * 1000));
    audio.onended = () => {
        if (sceneIdx < SCENES.length - 1) {
            goTo(sceneIdx + 1, true);
        } else {
            setPlaying(false);
            progressFill.style.width = '100%';
        }
    };
    audio.play().catch(() => {
        // Audio blocked — auto-advance after fixed timeout
        const t = setTimeout(() => {
            if (sceneIdx < SCENES.length - 1) goTo(sceneIdx + 1, true);
            else setPlaying(false);
        }, 12000);
        timers.push(t);
    });
}

// ── PLAY / PAUSE ──────────────────────────────────────────────────────────────
function setPlaying(val) {
    isPlaying = val;
    iconPlay.style.display  = val ? 'none' : '';
    iconPause.style.display = val ? ''     : 'none';
}

function togglePlay() {
    if (!isPlaying) {
        setPlaying(true);
        playAudio(SCENES[sceneIdx]);
    } else {
        setPlaying(false);
        stopAudio();
        clearTimers();
    }
}

// ── INTRO → PLAYER ────────────────────────────────────────────────────────────
function startDemo() {
    introEl.classList.add('is-out');
    setTimeout(() => {
        introEl.style.display = 'none';
        playerEl.classList.remove('is-hidden');
        goTo(0, true);
    }, 900);
}

// ── EVENTS ────────────────────────────────────────────────────────────────────
playBtnIntro.addEventListener('click', startDemo);
btnPP.addEventListener('click', togglePlay);
btnPrev.addEventListener('click', () => goTo(sceneIdx - 1, isPlaying));
btnNext.addEventListener('click', () => goTo(sceneIdx + 1, isPlaying));
btnRestart.addEventListener('click', () => { sceneIdx = 0; goTo(0, true); });

document.addEventListener('keydown', e => {
    if (playerEl.classList.contains('is-hidden')) return;
    if (e.key === ' ')           { e.preventDefault(); togglePlay(); }
    if (e.key === 'ArrowRight')  goTo(sceneIdx + 1, isPlaying);
    if (e.key === 'ArrowLeft')   goTo(sceneIdx - 1, isPlaying);
    if (e.key === 'Escape')      { stopAudio(); clearTimers(); playerEl.classList.add('is-hidden'); introEl.style.display = ''; requestAnimationFrame(() => introEl.classList.remove('is-out')); }
});

// ── INIT ──────────────────────────────────────────────────────────────────────
buildSlides();
buildDots();
