// Portfolio copy shaped from Anshul's interviews and reviewed working drafts.
export const PORTFOLIO_CONTENT = {
  about: {
    title: "About",
    subtitle: "From an idea to an experience people can use.",
    entries: [
      {
        id: "overview",
        // Structured restatements of this entry's own text, used by the diver profile card.
        name: "Anshul",
        base: "Kuala Lumpur",
        // role restates the summary below ("an applied AI product manager and hands-on solutions builder").
        role: "Applied AI product manager and hands-on solutions builder",
        title: "I build intelligent experiences.",
        tag: "Applied AI product",
        summary: "I am Anshul, a product manager who builds experiences for real people.",
        body: [
          "I use AI to build products and design experiences around AI. I help take an idea from its first form to a useful product.",
          "I became a certified diver at ten. This portfolio shares my love of the ocean and exploration."
        ],
        facts: ["Based in Kuala Lumpur", "Product strategy and customer discovery", "RAG systems, evaluation, and agent workflows"],
        links: [
          { label: "LinkedIn", url: "https://www.linkedin.com/in/anshulramprasad/" },
          { label: "GitHub", url: "https://github.com/anshulmao" },
          { label: "Email", url: "mailto:anshulramprasad@gmail.com" }
        ]
      },
      {
        id: "approach",
        title: "Start with people. Build the experience.",
        tag: "How I work",
        summary: "The experience is what makes an idea useful.",
        body: [
          "I talk to people, learn how they work today, and look for the problem behind the request.",
          "I take ownership when a problem needs a clear direction. I learn what I need to make progress.",
          "I build prototypes and do tests. I improve the details that make the product clear, useful, and ready for real users."
        ],
        facts: ["Real problems and real users", "From zero to one", "Learn, build, and iterate"],
        links: []
      }
    ]
  },
  experience: {
    title: "Experience",
    subtitle: "From research to AI product ownership.",
    entries: [
      {
        id: "product-manager",
        title: "Product Manager",
        tag: "Twimbit · Jan 2025 — present",
        // org / start / end restate the tag above for the dive log (end: null means present).
        org: "Twimbit", start: "2025-01", end: null,
        summary: "I lead product work for Rae across discovery, product decisions, launches, and adoption. I also make improvements directly in the product.",
        body: ["My role grew from content operations to product ownership. I work with users and technical teams to prepare solutions for enterprise use."],
        facts: ["Product roadmap and PRDs", "RAG, search, routing and evaluation", "Activation and enablement systems"],
        links: []
      },
      {
        id: "content-operations",
        title: "Product Content Manager",
        tag: "Twimbit · Sep 2024 — Jan 2025",
        org: "Twimbit", start: "2024-09", end: "2025-01",
        summary: "I managed content operations for Rae. I built workflows that used AI to help the team produce research and content.",
        body: ["I connected content requests to research, verification, and production for a team of three. A person reviewed the content before publication."],
        facts: ["Structured intake", "Workflow automation", "Human review"],
        links: []
      },
      {
        id: "research-foundations",
        title: "Consulting and research foundations",
        tag: "Twimbit · Sep 2023 — Sep 2024",
        org: "Twimbit", start: "2023-09", end: "2024-09",
        // stages and site restate the three facts below, for the dive profile chart and the log sheet.
        stages: [
          { label: "Advisory Maverick", start: "2023-09", end: "2023-12" },
          { label: "Consultant Analyst", start: "2024-01", end: "2024-09" }
        ],
        site: "Kuala Lumpur, Malaysia",
        summary: "I studied customer experience, strategy, competitors, and AI adoption for technology and financial-services organizations.",
        body: ["I used market evidence to prepare clear recommendations and presentations for clients."],
        facts: ["Consultant Analyst · Jan 2024 — Sep 2024", "Advisory Maverick · Sep 2023 — Dec 2023", "Kuala Lumpur, Malaysia"],
        links: []
      }
    ]
  },
  projects: {
    title: "Projects",
    subtitle: "Ideas built for real people and real problems.",
    entries: [
      {
        id: "rae",
        title: "Rae",
        tag: "Enterprise B2B AI · Live product",
        summary: "An enterprise sales platform shaped around the work people actually do.",
        body: [
          "I grew from managing content into leading product work for Rae, an AI sales-enablement platform for enterprise teams.",
          "I connect user conversations and usage data to product decisions, and work hands-on to improve the experience."
        ],
        facts: ["Frontline discovery and behavioral evidence", "RAG, search, routing, prompts, and response quality", "Structured activation and enablement around launches"],
        links: [{ label: "Rae’s public product story", url: "https://explorae.salesrechargekit.ai/#overview" }, {label:"Rae Engage · Live sample",url:"https://business.celcomdigi.com/plan/postpaid-phone"}]
      },
      {
        id: "reengage", title: "Rae Engage", tag: "Customer-facing AI · Public work sample",
        summary: "Helping business visitors find a plan and sales teams identify potential leads.",
        body: ["I led the product from discovery and stakeholder alignment through prototyping, launch, and iteration with the technical team.", "After launch, I used conversation and funnel analysis to find friction, then tested and implemented a shorter path from recommendation to lead form."],
        facts: ["Focused mobile-plan pilot", "Conversation and qualification design", "Product ownership and build contribution"],
        links: [{label:"Open Rae Engage",url:"https://business.celcomdigi.com/plan/postpaid-phone"}]
      },
      {
        id: "wattmana",
        title: "WattMana",
        tag: "Energy product · Independent build",
        summary: "An electricity bill should explain itself.",
        body: [
          "A mobile-first product for Malaysian households that turns a dense bill into a clear story: what changed, where the money went, what is estimated, and what to try next.",
          "Independently shaped the product, interaction model, information architecture, and working web and mobile prototypes.",
          "Device costs are modeled estimates, not meter observations."
        ],
        facts: ["Ringgit and kWh shown together", "Device estimates and confidence ranges kept visible", "Home, Bills, My Use, and Learn"],
        links: [{ label: "GitHub profile", url: "https://github.com/anshulmao" }]
      },
      {
        id: "sage",
        title: "Sage",
        tag: "Health AI · Independent product",
        summary: "A voice-first home for the context behind your health.",
        body: [
          "A health-organization prototype inspired by my own need to bring scattered health information into one place.",
          "Independently scoped, designed, and built the working experience.",
          "Voice capture and daily check-ins make it easier to build context over time. Sage supports organization and preparation, not clinical judgment."
        ],
        facts: ["Voice capture for daily health context", "Check-ins, reminders, documents, visit notes, and a timeline", "Lovable, Supabase, Claude API, and Web Speech API"],
        links: [{label:"Sage · Live demo",url:"https://sage-personal-health.lovable.app/"}]
      },
      {
        id: "openclaw",
        title: "OpenClaw",
        tag: "Persistent agents · Open-source experiment",
        summary: "Finding the useful edge of always-on agents.",
        body: [
          "A hands-on exploration of persistent agents: useful workflows, memory, token economics, infrastructure, and security boundaries.",
          "Built and operated the environment, documented the tradeoffs, and open-sourced the work.",
          "Persistence is valuable when context compounds and timing matters. It is wasteful when a bounded workflow or conventional automation can solve the job more simply."
        ],
        facts: ["Persistent memory and RAG patterns", "Scheduled automations and recurring jobs", "Git-based knowledge synchronization"],
        links: [{ label: "GitHub profile", url: "https://github.com/anshulmao" }]
      }
    ]
  },
  resume: {
    title: "Resume",
    subtitle: "A compact view of the work.",
    entries: [{
      id: "portfolio-resume", title: "The work, at a glance.", tag: "Resume · AI Product & Agent Strategist",
      format: "PDF", issued: "September 2026",
      summary: "Product strategy, applied AI and hands-on delivery.",
      body: ["Download my featured resume, or open the PDF in a new tab.", "The project stories provide more context behind the work."],
      facts: ["AI Product & Agent Strategist", "PDF · September 2026"],
      links: [{label:"Download resume",url:"./assets/portfolio/agent-strategist-resume.pdf",download:true},{label:"Open PDF",url:"./assets/portfolio/agent-strategist-resume.pdf"}],
      alternatives: [
        {label:"Product Manager",url:"./assets/portfolio/resume-core-pm.pdf",download:true},
        {label:"Forward Deployed Product Manager",url:"./assets/portfolio/resume-forward-deployed-pm.pdf",download:true},
        {label:"Forward Deployed Engineer",url:"./assets/portfolio/resume-forward-deployed-engineer.pdf",download:true},
        {label:"Agentic AI Engineer",url:"./assets/portfolio/resume-agentic-ai-engineer.pdf",download:true},
        {label:"AI Solutions Engineer",url:"./assets/portfolio/resume-ai-solutions-engineer.pdf",download:true}
      ]
    }]
  }

};

// Editorial expansions restate existing public copy and qualitative evidence from the experience bank.
// No client metrics, internal artifacts, pilot targets, or clinical outcomes are claimed.
const PROJECT_STORIES = {
  rae: {
    role: "Product management and hands-on response-quality work",
    problem: "Most users stayed in the default chat mode. An evaluation based on real conversations showed that this mode did not answer many questions well.",
    decision: "I used user conversations, usage data, and an evaluation benchmark to find the problem. The technical team improved the knowledge backend. I improved routing, prompts, and response behavior.",
    outcome: "I helped improve the default experience and spoke with users after launch. Users said that chat gave them more useful answers.",
    learning: "People often use the most familiar path. The product needs to make that path useful.",
    evidence: "Product screens from Rae’s public product story and the supplied screen deck show the platform’s sales tools."
  },
  reengage: {
    role: "Product ownership, prototyping, and hands-on iteration",
    problem: "A website form received sales inquiries, support requests, and other messages. The team could not easily identify potential sales leads.",
    decision: "I worked with client teams to design a mobile-plan journey and do tests. After launch, I found an extra step before the lead form. I shortened the form and the path to it.",
    outcome: "The assistant is live. More people completed the form after the changes. We continue to improve the journey through user data and sales feedback.",
    learning: "A useful recommendation needs a clear next step. Conversation and funnel analysis help me find where people stop.",
    evidence: "Browser capture of the public customer-facing assistant. Rae Engage is presented separately from the enterprise Rae platform."
  },
  wattmana: {
    role: "Independent product design and working prototypes",
    problem: "My electricity bill changed each month, but I could not explain why. The charges and adjustments were difficult to understand.",
    decision: "I chose a story format to explain the bill in small steps. The interface shows ringgit and kWh together. It separates bill data from estimated device costs.",
    outcome: "The web and mobile prototypes connect the bill to a model of household use. Device costs remain estimates, not meter measurements.",
    learning: "People need to know where each number comes from. The interface must make estimates clear.",
    evidence: "Screenshot of the working browser prototype. This is a prototype story, with no household savings or production adoption claim."
  },
  sage: {
    role: "Solo product scope, design and working build",
    problem: "Personal health context is scattered across memories, documents, and appointments. Users need an easy way to keep that information in one place.",
    decision: "I chose voice capture and daily check-ins to make data entry easier. A central action button lets people speak naturally.",
    outcome: "I built a health-organization prototype with voice capture, check-ins, documents, and visit notes. The prototype supports organization and preparation. It does not replace clinical judgment.",
    learning: "The experience needs personal context. The process to provide that context must be easy.",
    evidence: "Screenshot of the public demo, shown without existing personal health records. The demo is linked below."
  },
  openclaw: {
    role: "Independent build, operation and documentation",
    problem: "Always-on agents offer persistent context, but also introduce infrastructure, cost and security tradeoffs.",
    decision: "Build and operate an environment with a personal knowledge base, scheduled jobs and Git synchronization, then document where persistence is useful and where bounded automation is simpler.",
    outcome: "An operated agent environment, open-sourced work and written reflections on its practical tradeoffs. The link below is my GitHub profile, not a verified project repository link.",
    learning: "Persistence is valuable when context compounds and timing matters. It should earn its operational complexity.",
    evidence: "Original conceptual diagram of the documented workflow components. It is not a product interface or an internal architecture disclosure."
  },
  'ocean-world': {
    role: "Product direction and iterative AI-assisted implementation",
    problem: "Make a personal portfolio feel exploratory and memorable while keeping professional information easy to reach.",
    decision: "Offer direct reading alongside the Three.js world. Use familiar portfolio sections, optional guided travel, clear controls and progressive asset preparation.",
    outcome: "This browser experience brings together a cycling sky, underwater terrain, creature behaviors, a dive computer and portfolio records. The reading path remains available without learning to swim.",
    learning: "The world must invite attention without consuming all of it. Movement, loading and discovery need the same care as the case studies they introduce.",
    evidence: "Capture of this portfolio world. The features described here can be explored directly; this is an evolving build, not a claim of measured visitor outcomes."
  }
};
PORTFOLIO_CONTENT.projects.entries.push({
  id: "ocean-world", title: "A world to explore", tag: "Creative web · This portfolio",
  summary: "A portfolio you can swim through, with a direct path to the work.",
  body: ["A browser-based ocean built with Three.js, shaped through repeated testing of movement, lighting, navigation, creatures and portfolio presentation.", "A personal experiment in balancing atmosphere, discovery and ease of use."],
  facts: ["Three.js world and lightweight reading path", "First- and third-person exploration", "Iterated controls, loading and accessibility"], links: []
});
// Keep the user's priority stories first in both the archive and reading path.
const projectOrder = ['rae', 'reengage', 'sage', 'wattmana', 'ocean-world', 'openclaw'];
PORTFOLIO_CONTENT.projects.entries.sort((a, b) => projectOrder.indexOf(a.id) - projectOrder.indexOf(b.id));
for (const entry of PORTFOLIO_CONTENT.projects.entries) {
  entry.caseStudy = PROJECT_STORIES[entry.id];
  entry.role = entry.caseStudy.role;
}
PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'reengage').gallery = ['reengage-welcome', 'reengage-languages', 'reengage-plan', 'reengage-plan-details'];
Object.assign(PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'rae'), {
  gallery: ['rae-chat', 'rae-proposals', 'rae-practice', 'rae-documents'],
  galleryTitle: 'Across the sales workflow.',
  galleryIntro: 'Research, proposals, sales practice, and document Q&A in one platform.',
  galleryLayout: 'wide'
});
PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'rae').diagram = {
  label: "From evidence to product use", steps: ["Discover real workflows", "Shape & improve the product", "Activate, observe & learn"],
  caption: "Conceptual product loop · An original explanation, not private product UI"
};
PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'openclaw').diagram = {
  label: "When context needs to persist", steps: ["Retain useful context", "Run a bounded recurring task", "Review & synchronize"],
  caption: "Conceptual workflow · An original explanation, not a product screenshot"
};
PORTFOLIO_CONTENT.about.entries.find(entry => entry.id === 'approach').examples = [
  { title: "Listen and investigate", text: "On Rae, I pair user conversations with behavior data to find the real problem.", project: "rae" },
  { title: "Make the next step easier", text: "On Rae Engage, I used funnel analysis to improve the path from a recommendation to the lead form.", project: "reengage" },
  { title: "Make uncertainty visible", text: "In WattMana, separate measured bill information from modeled appliance estimates.", project: "wattmana" }
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
  wattmana: { src: './assets/portfolio/wattmana.png', alt: 'WattMana electricity bill explanation interface', caption: 'WattMana · Working browser prototype', kind: 'product', width: 1440, height: 1000 },
  'portfolio-resume': { src: './assets/portfolio/resume-agent-preview.png', alt: 'Preview of the AI Product and Agent Strategist resume', caption: 'AI Product & Agent Strategist · September 2026', kind: 'document', width: 850, height: 1100 },
};

// New introduction drafts: selectable for review, awaiting user approval.
export const COPY_VARIANTS = {
  concise: {
    label: "Concise",
    about: "I build useful AI products around real workflows, evidence, and adoption.",
    experience: "My work grew from consulting research into content operations and AI product leadership.",
    projects: "Enterprise AI, household energy, health continuity, and persistent-agent experiments.",
    resume: "A concise record of my product and applied AI work."
  },
  story: {
    label: "Story",
    about: "I start with the work people need to do, then connect the product decisions, AI behavior, and feedback that help them do it.",
    experience: "Research taught me to ask better questions. Operating products taught me to turn those questions into useful systems.",
    projects: "Each project starts with a different human problem and explores what AI or clearer product design can contribute.",
    resume: "The career snapshot; the archive tells the stories behind it."
  },
  technical: {
    label: "Technical",
    about: "My work connects discovery and product strategy with retrieval, routing, evaluation, agent workflows, and human review.",
    experience: "Across research, content operations, and product management, I connect requirements, analytics, system behavior, and enablement.",
    projects: "Explore RAG product work, bill explanation, voice-first health organization, and persistent-agent workflows.",
    resume: "Product ownership and technical fluency, summarized in a downloadable PDF."
  }
};
