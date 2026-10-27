// Existing portfolio copy, adapted into panel data. This is not a new approval.
// Source and review boundaries are recorded in COPY_REVIEW.md.
export const PORTFOLIO_CONTENT = {
  about: {
    title: "About",
    subtitle: "Product decisions. Technical systems. Adoption.",
    entries: [
      {
        id: "overview",
        // Structured restatements of this entry's own text, used by the diver profile card.
        name: "Anshul",
        base: "Kuala Lumpur",
        // role restates the summary below for the diver profile card.
        role: "Applied AI product manager and product builder",
        title: "I turn AI into products that fit real work.",
        tag: "Applied AI product",
        summary: "I’m Anshul, an applied AI product manager who works across product strategy and technical delivery.",
        body: [
          "I connect user workflows, model behavior, evaluation, and adoption. This work helps teams move enterprise AI from a demo into daily use.",
          "My work spans AI product strategy, technical systems, enterprise delivery, and measurable product use."
        ],
        facts: ["Based in Kuala Lumpur", "Product strategy and user research", "RAG systems, evaluation, and agent workflows"],
        links: [
          { label: "LinkedIn", url: "https://www.linkedin.com/in/anshulramprasad/" },
          { label: "GitHub", url: "https://github.com/anshulmao" },
          { label: "Email", url: "mailto:anshulramprasad@gmail.com" }
        ]
      },
      {
        id: "approach",
        title: "How I make product decisions.",
        tag: "Operating principles",
        summary: "A good model response does not prove product value.",
        body: [
          "An AI product includes the user workflow, system limits, evaluation, error recovery, measurement, and reasons to return.",
          "I compare user feedback with observed behavior. Then I define a focused change that addresses the main constraint.",
          "Tool limits, validation, human review, and fixed rules help automation work within known limits."
        ],
        facts: ["Evidence before scope", "Adoption is product work", "Bound autonomy"],
        links: []
      }
    ]
  },
  experience: {
    title: "Experience",
    subtitle: "From research to AI product leadership.",
    entries: [
      {
        id: "product-manager",
        title: "Product Manager",
        tag: "Twimbit · Jan 2025 — present",
        // org / start / end restate the tag above for the dive log (end: null means present).
        org: "Twimbit", start: "2025-01", end: null,
        summary: "I lead Rae across product strategy, research, requirements, analytics, AI design, launches, adoption, and enterprise alignment.",
        body: ["I studied the market, operated the product, and improved its AI systems. I also built new product capabilities."],
        facts: ["Product roadmap and requirements", "RAG, search, routing, and evaluation", "Launch, activation, and user enablement"],
        links: []
      },
      {
        id: "content-operations",
        title: "Product Content Manager",
        tag: "Twimbit · Sep 2024 — Jan 2025",
        org: "Twimbit", start: "2024-09", end: "2025-01",
        summary: "Built content operations that used AI to support structured intake, automated workflows, research assistants, and human review.",
        body: ["I linked structured requests to research, fact review, and publication for a three-person team. A person reviewed each item before publication."],
        facts: ["Structured request intake", "Automated workflows", "Human review before publication"],
        links: []
      },
      {
        id: "research-foundations",
        title: "Consulting and research",
        tag: "Twimbit · Sep 2023 — Sep 2024",
        org: "Twimbit", start: "2023-09", end: "2024-09",
        // stages and site restate the three facts below, for the dive profile chart and the log sheet.
        stages: [
          { label: "Advisory Maverick", start: "2023-09", end: "2023-12" },
          { label: "Consultant Analyst", start: "2024-01", end: "2024-09" }
        ],
        site: "Kuala Lumpur, Malaysia",
        summary: "Researched customer experience, strategy, competitors, and AI adoption for regional technology and financial services organizations.",
        body: ["I analyzed market evidence and turned it into recommendations and client presentations."],
        facts: ["Consultant Analyst · Jan 2024 — Sep 2024", "Advisory Maverick · Sep 2023 — Dec 2023", "Kuala Lumpur, Malaysia"],
        links: []
      }
    ]
  },
  projects: {
    title: "Projects",
    subtitle: "AI products from discovery through adoption.",
    entries: [
      {
        id: "rae",
        title: "Rae",
        tag: "Enterprise B2B AI · Live product",
        summary: "Connect AI features to product evidence, priorities, and user adoption.",
        body: [
          "I led product work for a live RAG-based sales platform. My work covered research, roadmap, requirements, analytics, response quality, launches, and user enablement.",
          "The platform needed clear priorities, reliable answers, and a repeatable path from feature release to active use."
        ],
        facts: ["User research and behavior data", "RAG, search, routing, prompts, and answer quality", "Launch plans, activation, and user enablement"],
        links: [{ label: "Rae’s public product story", url: "https://explorae.salesrechargekit.ai/#overview" }, {label:"Rae Engage · Live sample",url:"https://business.celcomdigi.com/plan/postpaid-phone"}]
      },
      {
        id: "reengage", title: "Rae Engage", tag: "Customer-facing AI · Public work sample",
        summary: "Guide business mobile-plan questions toward clear answers and sales follow-up.",
        body: ["I defined the pilot problem, scope, and requirements. I aligned stakeholders and contributed to the build.", "The pilot answered questions about business mobile plans. It guided the conversation and collected information for sales follow-up. The public sample shows the assistant on the customer website."],
        facts: ["Business mobile-plan pilot", "Conversation and lead-qualification design", "Product ownership and build work"],
        links: [{label:"Open Rae Engage",url:"https://business.celcomdigi.com/plan/postpaid-phone"}]
      },
      {
        id: "wattmana",
        title: "WattMana",
        tag: "Energy product · Independent build",
        summary: "Make each electricity bill easier to understand.",
        body: [
          "A mobile-first product for Malaysian households. It explains bill changes, charges, estimates, and possible next steps.",
          "I shaped the product, interactions, and information structure. I also built working web and mobile prototypes.",
          "The product estimates device costs. It does not measure device use."
        ],
        facts: ["Shows Ringgit and kWh together", "Labels device estimates and confidence ranges", "Home, Bills, My Use, and Learn sections"],
        links: [{ label: "GitHub profile", url: "https://github.com/anshulmao" }]
      },
      {
        id: "sage",
        title: "Sage",
        tag: "Health AI · Independent product",
        summary: "Help people prepare for each health appointment.",
        body: [
          "A voice-enabled health assistant that helps people record and organize health information between appointments.",
          "I defined the scope, designed the experience, and built the working product.",
          "The assistant supports preparation and organization. It does not replace clinical judgment."
        ],
        facts: ["Voice notes for daily health context", "Check-ins, reminders, documents, visit notes, and timeline", "Built with Lovable, Supabase, Claude API, and Web Speech API"],
        links: [{label:"Sage · Live demo",url:"https://sage-personal-health.lovable.app/"}]
      },
      {
        id: "openclaw",
        title: "OpenClaw",
        tag: "Persistent agents · Open-source experiment",
        summary: "Explore where persistent agents add value.",
        body: [
          "An experiment with persistent agents, workflows, memory, token costs, infrastructure, and security limits.",
          "I built and operated the environment. I documented the tradeoffs and released the work as open source.",
          "Persistent context helps when useful information builds over time or work depends on timing. A bounded workflow or standard automation is simpler for many tasks."
        ],
        facts: ["Persistent memory and RAG methods", "Scheduled and recurring tasks", "Knowledge updates through Git"],
        links: [{ label: "GitHub profile", url: "https://github.com/anshulmao" }]
      }
    ]
  },
  resume: {
    title: "Resume",
    subtitle: "A short summary of my work.",
    entries: [{
      id: "portfolio-resume", title: "My experience in one document.", tag: "Resume · Portfolio PDF",
      // format and issued restate the fact "PDF · July 2026" for the document sleeve.
      format: "PDF", issued: "July 2026",
      summary: "Product strategy, applied AI, and technical delivery.",
      body: ["Download the resume or open the PDF in a new tab.", "This version targets AI Product Manager roles and dates from July 2026. The project stories provide more detail."],
      facts: ["AI Product Manager resume", "PDF · July 2026", "Existing portfolio document"],
      links: [{label:"Download resume",url:"./assets/portfolio/portfolio-resume.pdf",download:true},{label:"Open PDF",url:"./assets/portfolio/portfolio-resume.pdf"}]
    }]
  }

};

// Editorial expansions restate existing public copy and qualitative evidence from the experience bank.
// No client metrics, internal artifacts, pilot targets, or clinical outcomes are claimed.
const PROJECT_STORIES = {
  rae: {
    role: "Product leadership and response-quality work",
    problem: "A live sales platform needed clear priorities, reliable answers, and a path from feature releases to repeat use.",
    decision: "Use frontline research and behavior data to guide priorities. Improve retrieval, search, and routing. Plan user activation and enablement with each release.",
    outcome: "I linked the roadmap, requirements, response system, analytics, and launch work across a live enterprise platform. I contributed to the platform; I did not build it alone.",
    learning: "A useful AI answer does not ensure product adoption. Teams must improve answer quality and support regular product use.",
    evidence: "The public product story shows the platform. The diagram below explains my approach; it does not show a private system."
  },
  reengage: {
    role: "Pilot ownership and build contribution",
    problem: "Business-plan questions needed a clear path from the first question to lead qualification and sales follow-up.",
    decision: "Limit the pilot to business mobile plans. Design the conversation, lead information, and stakeholder handoffs for this use case.",
    outcome: "The public sample shows the customer-facing assistant. I defined the problem and requirements, aligned stakeholders, and contributed to the build. This story makes no claim about conversion results.",
    learning: "A focused pilot lets the team assess the core product idea before it adds product categories or integrations.",
    evidence: "This browser capture shows the public assistant. Rae Engage is separate from the enterprise Rae platform."
  },
  wattmana: {
    role: "Independent product design and working prototypes",
    problem: "A complex electricity bill makes it hard to understand changes and household costs.",
    decision: "Explain the bill. Show Ringgit and kWh together. Label estimated device costs separately from bill measurements.",
    outcome: "Web and mobile prototypes explain the bill, household use, and next steps. Device costs are estimates with confidence ranges. They are not meter readings or proven savings.",
    learning: "Show the source and uncertainty of each number to help users judge it.",
    evidence: "This screenshot shows a working browser prototype. It does not show production use or household savings."
  },
  sage: {
    role: "Product scope, design, and working build",
    problem: "People can find it hard to record symptoms and questions, then recall them during an appointment.",
    decision: "Use voice notes as a simple way to record daily health information. Connect those notes to check-ins, documents, visit notes, and a timeline.",
    outcome: "I built a voice-enabled health assistant with Lovable, Supabase, the Claude API, and the Web Speech API. It helps people prepare and organize information. It does not replace clinical judgment.",
    learning: "The product connects daily health notes to future appointments. This build does not establish clinical effectiveness.",
    evidence: "This screenshot shows the public demo without personal health records. Open the demo below."
  },
  openclaw: {
    role: "Independent build, operation, and documentation",
    problem: "Persistent agents retain context, but they also add infrastructure, cost, and security concerns.",
    decision: "Build and operate an agent environment with a knowledge base, scheduled tasks, and Git sync. Document when persistent context helps and when a bounded workflow is simpler.",
    outcome: "I operated an agent environment, released the work as open source, and documented its tradeoffs. The link opens my GitHub profile, not a verified project repository.",
    learning: "Persistent context helps when information builds over time or timing matters. Use it only when that value justifies the operating cost.",
    evidence: "This original diagram explains the workflow. It does not show a product interface or internal system design."
  },
  'ocean-world': {
    role: "Product direction and AI-assisted implementation",
    problem: "Make a personal portfolio memorable and easy to explore. Keep professional information easy to find.",
    decision: "Pair a Three.js ocean with a direct reading path. Add familiar portfolio sections, guided travel, clear controls, and staged asset loading.",
    outcome: "The browser experience combines an animated sky, underwater terrain, creature behavior, a dive computer, and portfolio records. Users can also read the portfolio without exploring the ocean.",
    learning: "The world should invite exploration and keep the work easy to reach. Movement, loading, and navigation need the same care as the project stories.",
    evidence: "This image shows the portfolio world. Users can explore the features directly. The project does not claim measured visitor outcomes."
  }
};
PORTFOLIO_CONTENT.projects.entries.push({
  id: "ocean-world", title: "A world to explore", tag: "Creative web · This portfolio",
  summary: "Explore the portfolio in a Three.js ocean or use the direct reading path.",
  body: ["I built a browser-based ocean with Three.js. I refined movement, lighting, navigation, creatures, and portfolio content through repeated reviews.", "This project explores how atmosphere and discovery can work with ease of use."],
  facts: ["Three.js ocean and direct reading path", "First- and third-person views", "Refined controls, loading, and accessibility"], links: []
});
for (const entry of PORTFOLIO_CONTENT.projects.entries) {
  entry.caseStudy = PROJECT_STORIES[entry.id];
  entry.role = entry.caseStudy.role;
}
PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'rae').diagram = {
  label: "From evidence to product use", steps: ["Study user workflows", "Shape and improve the product", "Support use and review results"],
  caption: "Product loop · Original explanation, not private product interface"
};
PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'openclaw').diagram = {
  label: "When an agent needs context", steps: ["Save useful context", "Run a defined recurring task", "Review and sync results"],
  caption: "Workflow · Original explanation, not a product screenshot"
};
PORTFOLIO_CONTENT.about.entries.find(entry => entry.id === 'approach').examples = [
  { title: "Use evidence to set scope", text: "On Rae, compare user research with behavior data to set priorities.", project: "rae" },
  { title: "Plan for product use", text: "Pair enterprise releases with activation, education, and user support.", project: "rae" },
  { title: "Show uncertainty", text: "In WattMana, label bill measurements and device estimates separately.", project: "wattmana" }
];

export const PORTFOLIO_MEDIA = {
  overview: { src: './assets/portfolio/ocean-world.png', alt: 'The reef in my browser-based portfolio', caption: 'A world to explore · This portfolio', kind: 'scene', width: 1280, height: 800 },
  'ocean-world': { src: './assets/portfolio/ocean-world.png', alt: 'The reef in this browser-based portfolio', caption: 'A world to explore · This portfolio', kind: 'scene', width: 1280, height: 800 },
  reengage: { src: './assets/portfolio/reengage.jpg', alt: 'Rae Engage chat widget open on the CelcomDigi business website', caption: 'Rae Engage · Live public work sample', kind: 'product', width: 1265, height: 712 },
  sage: { src: './assets/portfolio/sage.jpg', alt: 'Sage personal health demo interface', caption: 'Sage · Live demo interface', kind: 'product', width: 1280, height: 720 },
  wattmana: { src: './assets/portfolio/wattmana.png', alt: 'WattMana electricity bill explanation interface', caption: 'WattMana · Working browser prototype', kind: 'product', width: 1440, height: 1000 },
  'portfolio-resume': { src: './assets/portfolio/resume.png', alt: 'Preview of the existing portfolio resume PDF', caption: 'AI Product Manager · July 2026', kind: 'document', width: 850, height: 1100 },
};

// New introduction drafts: selectable for review, awaiting user approval.
export const COPY_VARIANTS = {
  concise: {
    label: "Concise",
    about: "I build AI products around user workflows, evidence, and adoption.",
    experience: "I moved from consulting research to content operations and AI product leadership.",
    projects: "Enterprise AI, household energy, health organization, and persistent agents.",
    resume: "A short record of my product and applied AI work."
  },
  story: {
    label: "Story",
    about: "I start with the work people need to do. Then I connect product decisions, AI behavior, and user feedback to that work.",
    experience: "Research taught me to ask clear questions. Product work taught me to turn answers into useful systems.",
    projects: "Each project starts with a user problem. It explores how AI or clear product design can help.",
    resume: "A career summary, with project stories in the archive."
  },
  technical: {
    label: "Technical",
    about: "I connect user research and product strategy with retrieval, routing, evaluation, agent workflows, and human review.",
    experience: "I connect requirements, analytics, system behavior, and user support across research, content operations, and product management.",
    projects: "Explore RAG products, bill explanations, voice-based health organization, and persistent-agent workflows.",
    resume: "A downloadable PDF that summarizes my product work and technical skills."
  }
};
