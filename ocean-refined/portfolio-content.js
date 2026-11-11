// Portfolio copy. Written for hiring managers of forward deployed AI roles (product and engineering): each entry says
// what the problem was, what Anshul did himself, and what changed, with the figure where one exists. Figures for Rae
// and Rae Engage are Twimbit and CelcomDigi product metrics, cleared by Anshul for public use.
export const PORTFOLIO_CONTENT = {
  about: {
    title: "About",
    subtitle: "Product judgment, hands-on AI work, and adoption.",
    entries: [
      {
        id: "overview",
        // Structured restatements of this entry's own text, used by the diver profile card.
        name: "Anshul",
        base: "Kuala Lumpur",
        role: "AI product manager and hands-on builder",
        title: "I turn customer problems into working AI.",
        tag: "Forward deployed AI",
        summary: "I connect customer discovery, hands-on AI work, and adoption to build products people can use.",
        body: [
          "At Twimbit, I lead product for Rae, an enterprise AI sales platform with 350+ registered users at CelcomDigi. I work with account managers, study usage, and turn what I learn into product priorities. I also build evaluations and improve prompts, routing, and retrieval with Claude Code and Codex, working with engineers on review and validation.",
          "I studied computer science, specialising in data science and AI, at Taylor’s University. I spent a year in consulting research before moving into product.",
          "I became a certified diver at ten, which is why this portfolio is also a reef you can swim through."
        ],
        facts: ["Based in Kuala Lumpur", "Customer discovery, evaluation and rollout", "RAG, routing, prompts and agent workflows"],
        links: [
          { label: "LinkedIn", url: "https://www.linkedin.com/in/anshulramprasad/" },
          { label: "GitHub", url: "https://github.com/anshulmao" },
          { label: "Email", url: "mailto:anshulramprasad@gmail.com" }
        ]
      },
      {
        id: "approach",
        title: "Find the cause, then build the fix.",
        tag: "How I work",
        summary: "Four habits I keep on every project.",
        // Each fact is the heading of the paragraph at the same position in body.
        body: [
          "Discovery sessions with account managers show me where the workflow breaks. Thirty months of usage data help me check how widespread those problems are. I use both to set priorities.",
          "Rae’s evaluation is 104 cases in English, Malay and Chinese, picked from logged conversations by how often each kind of question came up. A model scores the answers and a person reviews the scores.",
          "Features we released quietly did not keep their users. Each launch now ships with training and follow-up, and I check who came back.",
          "Assistants support research, drafting, and verification. An analyst reviews the content before publication."
        ],
        facts: ["Pair what people say with what they do", "Test against logged conversations", "Plan the rollout with the release", "Keep a person where judgment matters"],
        links: []
      }
    ]
  },
  experience: {
    title: "Experience",
    subtitle: "Three years at Twimbit, from research to owning an AI product.",
    entries: [
      {
        id: "product-manager",
        title: "Product Manager",
        tag: "Twimbit · Jan 2025 — present",
        // org / start / end restate the tag above for the dive log (end: null means present).
        org: "Twimbit", start: "2025-01", end: null,
        summary: "I lead Rae’s roadmap, discovery, analytics, and launches, alongside hands-on work on AI response quality.",
        body: [
          "Rae has 350+ registered users at CelcomDigi and 13 live features. I helped recover monthly active usage from 15 to 175 through product improvements, launch activity, and enablement.",
          "I built a 104-case evaluation in three languages, rewrote the system prompts, and worked on retrieval rules and automatic routing in the FastAPI and Weaviate codebase.",
          "I owned delivery of Rae Engage across requirements, conversation design, testing, and iteration. The pilot recorded 219 leads from 18 August to 30 October 2026. I also led frontline discovery sessions and co-led or supported three AI training cohorts reaching 150+ participants."
        ],
        facts: ["350+ registered users, 13 live features", "Monthly active users 15 → 175", "104-case evaluation in three languages", "Three training cohorts, 150+ people"],
        links: []
      },
      {
        id: "content-operations",
        title: "Product Content Manager",
        tag: "Twimbit · Sep 2024 — Jan 2025",
        org: "Twimbit", start: "2024-09", end: "2025-01",
        summary: "I ran content operations for Rae in a team of three and rebuilt how requests were handled.",
        body: [
          "The publishing calendar missed what frontline sales staff were asking for. I built request intake and triage in Intercom and Typeform, and set up assistants for research and fact-checking. An analyst reviewed every piece before publication.",
          "Output went from about 150 pieces a year to more than 400. A piece that used to take three to five days took a few hours, against a 16-hour request-to-delivery target."
        ],
        facts: ["About 150 → 400+ pieces a year", "Days → hours per piece", "Analyst review on every piece"],
        links: []
      },
      {
        id: "research-foundations",
        title: "Research and advisory",
        tag: "Twimbit · Sep 2023 — Sep 2024",
        org: "Twimbit", start: "2023-09", end: "2024-09",
        // stages and site restate the three facts below, for the dive profile chart and the log sheet.
        stages: [
          { label: "Advisory Maverick", start: "2023-09", end: "2023-12" },
          { label: "Consultant Analyst", start: "2024-01", end: "2024-09" }
        ],
        site: "Kuala Lumpur, Malaysia",
        summary: "I researched customer experience, competitors and AI adoption for technology, telecom and financial-services clients.",
        body: ["The work was customer-experience benchmarking, market research and competitive analysis across the region, ending in recommendations and client presentations."],
        facts: ["Consultant Analyst · Jan 2024 — Sep 2024", "Advisory Maverick · Sep 2023 — Dec 2023", "Kuala Lumpur, Malaysia"],
        links: []
      }
    ]
  },
  projects: {
    title: "Projects",
    subtitle: "Enterprise AI products, independent builds, and experiments.",
    entries: [
      {
        id: "rae",
        title: "Rae",
        tag: "Enterprise AI · Live product",
        summary: "Enterprise AI for sales teams. I lead product and work hands-on to improve answer quality and adoption.",
        body: [
          "Rae helps CelcomDigi’s enterprise account managers, pre-sales and business development staff answer product questions, research accounts and competitors, and draft proposals.",
          "I lead product and contribute directly to response quality, evaluations, launch planning, and adoption."
        ],
        facts: ["350+ registered users", "Monthly active users 15 → 175", "104 test cases in English, Malay and Chinese"],
        links: [{ label: "Rae’s public product story", url: "https://explorae.salesrechargekit.ai/#overview" }, { label: "Twimbit’s Rae 2.0 write-up", url: "https://twimbit.com/blogs/rae-2-0-powering-the-next-chapter-of-enterprise-sales-excellence-with-celcomdigi" }]
      },
      {
        id: "reengage", title: "Rae Engage", tag: "Customer-facing AI · Live pilot",
        summary: "A website assistant that qualifies business visitors as sales leads. The lead rate among engaged visitors went from 7.0% to 18.1%.",
        body: [
          "My Head of Product set the concept and the overall scope. I owned requirements, success measures, stakeholder alignment, acceptance testing and the conversation design, and I contributed to the build.",
          "The demo build uses FastAPI with streamed model responses, plan cards, structured lead capture and background lead scoring."
        ],
        facts: ["16,854 sessions and 219 leads, 18 Aug – 30 Oct 2026", "Lead rate among engaged visitors 7.0% → 18.1%", "Form completion 25% → 46%", "Satisfaction 4.4 out of 5"],
        links: [{ label: "Open Rae Engage", url: "https://business.celcomdigi.com/plan/postpaid-phone" }]
      },
      {
        id: "wattmana",
        title: "WattMana",
        tag: "Energy · Hackathon build",
        summary: "A clearer view of your electricity bill, with billed usage, device estimates, and unexplained usage shown separately.",
        body: [
          "Built for the Codex Community Hackathon in Kuala Lumpur in July 2026. Malaysian households can see a total and a kWh figure on their bill, but not what changed or which appliance or habit explains it.",
          "I shaped the product and built working web and mobile prototypes on my own."
        ],
        facts: ["React web app and Expo mobile app, TypeScript, Supabase", "Reads the bill as text first, with OCR as the fallback", "Estimates always shown apart from billed figures"],
        links: [{ label: "WattMana · Live demo", url: "https://wattmana-mobile.vercel.app/" }]
      },
      {
        id: "sage",
        title: "Sage",
        tag: "Health AI · Hackathon finalist",
        summary: "A voice-first place to keep your health history, built solo for the Lovable Vibeathon.",
        body: [
          "Friends of mine were managing chronic conditions or recovering from surgery. I had been asking general chatbots health questions that needed my history to answer well.",
          "I entered the Patient Journey Automation track alone, representing Twimbit, and reached the final."
        ],
        facts: ["Voice logging, check-ins, reminders, documents, visit notes and a timeline", "Lovable, Supabase, React and the Web Speech API", "Finalist, Lovable Vibeathon"],
        links: [{ label: "Sage · Live demo", url: "https://sage-personal-health.lovable.app/" }, { label: "Vibeathon post", url: "https://www.linkedin.com/posts/anshulramprasad_vibeathon-lovable-openclaw-activity-7465675358755864576-SeCf" }]
      },
      {
        id: "openclaw",
        title: "OpenClaw",
        tag: "Agents · Three-week experiment",
        summary: "I ran an always-on personal agent for three weeks and wrote up what broke.",
        body: [
          "I kept losing AI articles, videos and documents I meant to come back to, and I wanted to test an agent that lives outside a chat tab.",
          "I set up OpenClaw with Telegram and the Gemini API, wrote its identity, workspace rules, routing and redaction instructions, and ran scheduled jobs and Git sync. I specified a vector knowledge base and had the agent build it."
        ],
        facts: ["Three weeks, at least seven reinstalls", "About RM200 in API spend", "20,000 extra input tokens on one short status request"],
        links: [{ label: "Read the write-up", url: "https://www.linkedin.com/pulse/i-ran-openclaw-three-weeks-heres-what-broke-first-anshul-ramprasad-jtkvc" }, { label: "Visual breakdown", url: "https://www.linkedin.com/posts/anshulramprasad_i-tested-openclaw-for-three-weeks-heres-activity-7474133497457090560-Eth0" }]
      }
    ]
  },
  resume: {
    title: "Resume",
    subtitle: "The work on two pages.",
    entries: [{
      id: "portfolio-resume", title: "The work on two pages.", tag: "Résumé · Forward deployed AI",
      format: "PDF", issued: "October 2026",
      summary: "Two versions, tailored to product and engineering opportunities.",
      body: ["One is written for forward deployed product manager roles and one for forward deployed engineer roles. The history is the same; the emphasis differs."],
      facts: ["Forward deployed AI", "PDF · October 2026"],
      links: [{label:"Download product résumé",url:"./assets/portfolio/resume-forward-deployed-pm.pdf",download:true},{label:"Download engineering résumé",url:"./assets/portfolio/resume-forward-deployed-engineer.pdf",download:true}],
      alternatives: []
    }]
  }

};

// Shared project sections for the reading page and ocean archive.
export const PROJECT_SECTIONS = [
  ['what', 'What it is', 'file'],
  ['why', 'Why I built it', 'search'],
  ['role', 'My role', 'users'],
  ['involvement', 'My involvement', 'build'],
  ['work', 'Examples of my work', 'build'],
  ['outcome', 'Outcomes', 'check'],
  ['future', 'What’s next', 'compass'],
];
const PROJECT_STORIES = {
  "rae": {
    "what": "Rae helps CelcomDigi’s enterprise sales teams answer product questions, research accounts and competitors, and draft proposals.",
    "role": "I lead product across discovery, roadmap, analytics, requirements, launches, and adoption. I also work directly on prompts, routing, retrieval, and evaluations, with engineering review and validation.",
    "work": [
      "Used account-manager discovery and 30 months of usage data to prioritise product improvements.",
      "Built a 104-case evaluation in English, Malay, and Chinese from real conversation patterns. Used it to diagnose response failures and retest changes.",
      "Improved system prompts, retrieval rules, document access, and automatic routing with Claude Code and Codex. The aim was to get users to the right sources without asking them to choose an AI mode.",
      "Planned launches, training, and follow-up to help features become part of everyday work."
    ],
    "outcome": [
      "Helped recover monthly active users from 15 to 175 within a population of 350+ registered users. This reflects the wider product and adoption effort, not a measured effect of routing alone.",
      "Retests and early user feedback indicated better responses. A comparable before-and-after quality score is not available."
    ]
  },
  "reengage": {
    "what": "A conversational assistant on CelcomDigi’s business website that helps visitors explore mobile plans and captures qualified leads for sales follow-up.",
    "role": "I owned delivery across requirements, success measures, stakeholder alignment, conversation design, acceptance testing, and iteration, and contributed to the build. My Head of Product set the initial concept and overall scope.",
    "work": [
      "Worked with sales, customer experience, product, brand, and marketing teams to define an actionable lead and scope the mobile-plan pilot.",
      "Designed qualification, plan recommendations, consent, and structured lead capture. The demo build uses FastAPI, streamed responses, plan cards, and background lead scoring.",
      "Reviewed conversations and the funnel after launch. We shortened qualification, added “Recommend for me”, removed a step before the form, and reduced the form from seven fields to three.",
      "Checked lead handoff: all 31 verified leads in the 10 September check had reached Salesforce."
    ],
    "outcome": [
      "The pilot recorded 16,854 sessions, 1,865 engaged conversations, and 219 leads from 18 August to 30 October 2026.",
      "Lead rate among engaged visitors rose from 7.0% on the first journey to 18.1% on the latest. Form completion rose from 25% to 46% after the form was shortened. Average satisfaction was 4.4 out of 5.",
      "These are pilot and journey-analysis figures, not completed purchases. Conversations also exposed a gap: existing customers often needed billing or service help that the first journey did not support."
    ]
  },
  "wattmana": {
    "what": "A web and mobile prototype that turns a Malaysian electricity bill into a short, readable explanation of charges and usage.",
    "why": "My bill changed each month, but the total did not tell me why. I wanted to understand what changed and how much my appliances and habits might explain.",
    "future": "I want to speak with potential users, understand their main problems, and improve WattMana’s features, UX, and performance. Then I hope to run a pilot and test whether it meets a real household need, working toward product-market fit.",
    "involvement": [
      "I shaped the product, designed the experience, and built the web and Expo mobile prototypes independently, starting with the July 2026 Codex Community Hackathon in Kuala Lumpur.",
      "The bill reader extracts printed text first and falls back to OCR. Users review extracted fields before saving. Device estimates stay separate from billed figures, and any unexplained usage remains visible.",
      "I replaced animated counters and rotating cards with stable figures and simple transitions so the bill story is easier to read. The hosted demo uses sample household data; savings and extraction accuracy have not been measured."
    ]
  },
  "sage": {
    "what": "A voice-first health-history prototype for logging daily updates, keeping documents, and preparing for appointments.",
    "why": "Friends were managing chronic conditions or recovering from surgery. I was also asking general chatbots health questions without the history they needed. I wanted a simpler way to keep that context together.",
    "future": "I want to speak with potential users, understand which health-history problems matter most, and improve Sage’s features, UX, and performance. Then I hope to run a pilot, learn from real use, and work toward product-market fit.",
    "involvement": [
      "I scoped, designed, and built Sage solo for the Patient Journey Automation track at the Lovable Vibeathon, representing Twimbit. It reached the final.",
      "I designed voice logging, check-ins, reminders, document handling, visit capture, and a health timeline. Users review proposed records before saving.",
      "The demo organises personal health information. It has not been validated for clinical use and does not provide medical advice."
    ]
  },
  "openclaw": {
    "what": "A three-week experiment running an always-on personal agent with a knowledge base, scheduled jobs, and Git sync.",
    "role": "I set up and operated the environment, wrote its workspace and routing rules, and documented the results.",
    "work": [
      "Connected Telegram and the Gemini API, specified a vector knowledge base, and had the agent build it.",
      "Tested recurring jobs, memory, redaction rules, and Git sync, keeping notes on failures and costs."
    ],
    "outcome": [
      "The knowledge base worked, but one short status request carried about 20,000 extra input tokens. I reinstalled or reconfigured the environment at least seven times and spent about RM200 on API calls.",
      "I published a write-up and visual breakdown covering the tradeoffs of persistence, cost, and reliability."
    ]
  },
  "ocean-world": {
    "what": "This portfolio: a Three.js reef to explore, alongside a reading page for quick access to the work.",
    "role": "I directed the product, design, and iteration with Claude Code and Codex, reviewing AI-written code and the resulting experience.",
    "work": [
      "Shaped diver controls, a guided route, a map, and a conventional reading path.",
      "Added repository instructions, a design system, agent review, and continuous integration to make implementation more consistent."
    ],
    "outcome": "One test run reduced first-load transfer from 42.79 MB to 27.91 MB and repeat-visit transfer from 17.61 MB to 0.11 MB. These are single measurements, not production performance guarantees."
  }
};
PORTFOLIO_CONTENT.projects.entries.push({
  id: "ocean-world", title: "A world to explore", tag: "Creative web · This portfolio",
  summary: "A portfolio you can swim through, built by directing AI coding agents.",
  body: ["A Three.js reef with diver controls, a guided route, a map, dive instruments and a reading page.", "I directed and iterated on the build with Claude Code and Codex."],
  facts: ["Three.js and WebGL, Node build, Vercel hosting", "Playwright and GitHub Actions checks on every change", "First-load transfer 42.79 MB → 27.91 MB in one test run"],
  links: [{ label: "Source on GitHub", url: "https://github.com/anshulmao/ocean-portfolio" }]
});
// Keep the user's priority stories first in both the archive and reading path.
const projectOrder = ['rae', 'reengage', 'sage', 'wattmana', 'ocean-world', 'openclaw'];
PORTFOLIO_CONTENT.projects.entries.sort((a, b) => projectOrder.indexOf(a.id) - projectOrder.indexOf(b.id));
for (const entry of PORTFOLIO_CONTENT.projects.entries) {
  entry.caseStudy = PROJECT_STORIES[entry.id];
  entry.role = entry.caseStudy.role ?? 'Solo: product, design and build';
}
Object.assign(PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'wattmana'), {
  gallery: ['wattmana-home', 'wattmana-story', 'wattmana-bills', 'wattmana-my-use'],
  galleryTitle: 'From the total to what explains it.',
  galleryIntro: 'Current mobile UI from the hosted demo, using sample household data.'
});
PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'reengage').gallery = ['reengage-welcome', 'reengage-languages', 'reengage-plan', 'reengage-plan-details'];
Object.assign(PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'rae'), {
  gallery: ['rae-chat', 'rae-proposals', 'rae-practice', 'rae-documents'],
  galleryTitle: 'Across the sales workflow.',
  galleryIntro: 'Research, proposals, sales practice and document Q&A in one platform.',
  galleryLayout: 'wide'
});
PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'rae').diagram = {
  label: "How the default chat was fixed", steps: ["Group the logged queries", "Test 104 cases in three languages", "Route each question automatically"],
  caption: "My own summary of the work · Not a product screen"
};
PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'openclaw').diagram = {
  label: "What the agent ran", steps: ["Keep a knowledge base", "Run scheduled jobs", "Sync to Git"],
  caption: "My own summary of the workflow · Not a product screen"
};
PORTFOLIO_CONTENT.about.entries.find(entry => entry.id === 'approach').examples = [
  { title: "Fix the default", text: "On Rae, most people stayed in the default chat mode, so we replaced manual mode selection with automatic routing.", project: "rae" },
  { title: "Shorten the form", text: "On Rae Engage, cutting the lead form from seven fields to three moved completion from 25% to 46%.", project: "reengage" },
  { title: "Make persistence pay for itself", text: "Three weeks running an always-on agent showed me one short status request could carry 20,000 extra input tokens.", project: "openclaw" }
];

export const PORTFOLIO_MEDIA = {
  overview: { src: './assets/portfolio/anshul-portrait.jpg', alt: 'Anshul Ramprasad outdoors', caption: 'Anshul Ramprasad', kind: 'portrait', width: 720, height: 1080 },
  rae: { src: './assets/portfolio/rae-platform.png', alt: 'Rae home screen with sales, proposal, persona and training tools', caption: 'Rae · Enterprise sales platform', kind: 'product', width: 1870, height: 951 },
  'rae-chat': { src: './assets/portfolio/rae-chat-sources.png', alt: 'Rae Chat response with source links and suggested follow-up questions', caption: 'Research with sources', description: 'Rae Chat shows sources and suggested questions beside the answer.', kind: 'product', width: 1870, height: 951 },
  'rae-proposals': { src: './assets/portfolio/rae-proposal-canvas.png', alt: 'A generated proposal on a canvas beside the Rae conversation', caption: 'Create and refine a proposal', description: 'The canvas keeps the draft beside the conversation for review and edits.', kind: 'product', width: 1874, height: 951 },
  'rae-practice': { src: './assets/portfolio/rae-sales-practice.png', alt: 'Rae Sales Simulator with a customer persona and voice simulation control', caption: 'Practice the conversation', description: 'Sales teams can practice with a customer persona before a real sales conversation.', kind: 'product', width: 1863, height: 917 },
  'rae-documents': { src: './assets/portfolio/rae-document-chat.png', alt: 'Rae DocuChat with a document and an AI question panel side by side', caption: 'Share a document with Q&A', description: 'Rae DocuChat puts a document beside AI answers and suggested questions.', kind: 'product', width: 1855, height: 923 },
  'ocean-world': { src: './assets/portfolio/ocean-world.png', alt: 'The living reef in this browser-based portfolio', caption: 'A world to explore · This portfolio', kind: 'scene', width: 1280, height: 800 },
  reengage: { src: './assets/portfolio/reengage.jpg', alt: 'Rae Engage chat widget open on the CelcomDigi business website', caption: 'Rae Engage · Live public work sample', kind: 'product', width: 1265, height: 712 },
  'reengage-welcome': { src: './assets/portfolio/rae-engage-welcome.png', alt: 'Rae Engage welcome with suggested ways to explore business mobile plans', caption: 'Start a conversation', kind: 'product', width: 373, height: 515 },
  'reengage-languages': { src: './assets/portfolio/rae-engage-languages.png', alt: 'Language menu with English, Bahasa Melayu and Chinese', caption: 'Choose a language', kind: 'product', width: 378, height: 517 },
  'reengage-plan': { src: './assets/portfolio/rae-engage-plan.png', alt: 'Business mobile plan card with its price and key features', caption: 'Explore a plan', kind: 'product', width: 377, height: 515 },
  'reengage-plan-details': { src: './assets/portfolio/rae-engage-plan-details.png', alt: 'Expanded mobile plan card showing contract and roaming details', caption: 'See plan details', kind: 'product', width: 379, height: 517 },
  sage: { src: './assets/portfolio/sage.jpg', alt: 'Sage personal health demo interface', caption: 'Sage · Live demo interface', kind: 'product', width: 1280, height: 720 },
  'wattmana-home': { src: './assets/portfolio/wattmana-home.png', alt: 'WattMana home screen with the bill total, kWh used and how much of it the devices explain', caption: 'The bill at a glance', description: 'The amount due, the change from last month, and how much use is explained.', kind: 'product', width: 780, height: 1688 },
  'wattmana-story': { src: './assets/portfolio/wattmana-story.png', alt: 'First step of the bill story showing the amount due, 63% modelled and a 37% gap', caption: 'The bill as a short story', description: 'Each step adds one fact, in ringgit or kWh.', kind: 'product', width: 780, height: 1688 },
  'wattmana-bills': { src: './assets/portfolio/wattmana-bills.png', alt: 'Bills screen with the latest bill and a six-month chart of amounts due', caption: 'Six months of bills', description: 'Add a bill by scanning it; past bills show the trend.', kind: 'product', width: 780, height: 1688 },
  'wattmana-my-use': { src: './assets/portfolio/wattmana-my-use.png', alt: 'My Use screen splitting 929 kWh measured into 582 kWh covered by estimates and a 347 kWh gap', caption: 'Measured, covered and the gap', description: 'Device estimates never replace the metered total; the gap is shown.', kind: 'product', width: 780, height: 1688 },
  wattmana: { src: './assets/portfolio/wattmana-home.png', alt: 'Current WattMana mobile home with the bill total, metered usage, device estimates and unexplained usage', caption: 'WattMana · Current mobile demo · Sample data', kind: 'product', width: 780, height: 1688 },
  'portfolio-resume': { src: './assets/portfolio/resume-fdpm-preview.png', alt: 'Preview of the forward deployed product manager résumé', caption: 'Forward deployed AI · October 2026', kind: 'document', width: 850, height: 1100 },
};

// Alternative section introductions for the editor's reading-style selector (not shipped: the build removes the selector).
export const COPY_VARIANTS = {
  concise: {
    label: "Concise",
    about: "AI product manager who finds the cause and builds the fix.",
    experience: "Research, then content operations, then owning an AI product.",
    projects: "Two live products at work and four independent builds.",
    resume: "Two versions: product manager and engineer."
  },
  story: {
    label: "Story",
    about: "I start with the people who use the product, read what they did, and change the product myself.",
    experience: "Research taught me to ask what a client is deciding. Product taught me to ship the answer.",
    projects: "Each project starts with a problem someone had and ends with what changed.",
    resume: "The summary; the project stories hold the detail."
  },
  technical: {
    label: "Technical",
    about: "Discovery and product decisions, plus hands-on retrieval, routing, evaluation and prompt work.",
    experience: "Evaluation sets, routing, retrieval rules, analytics and rollout across three roles.",
    projects: "RAG and routing in production, a lead-qualification assistant, bill OCR, voice health logging and an always-on agent.",
    resume: "Product ownership and hands-on engineering, as PDFs."
  }
};
