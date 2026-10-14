// Existing portfolio copy, adapted into panel data. This is not a new approval.
// Source and review boundaries are recorded in COPY_REVIEW.md.
export const PORTFOLIO_CONTENT = {
  about: {
    title: "About",
    subtitle: "Product judgment. Technical fluency. Adoption.",
    entries: [
      {
        id: "overview",
        // Structured restatements of this entry's own text, used by the diver profile card.
        name: "Anshul",
        base: "Kuala Lumpur",
        // role restates the summary below ("an applied AI product manager and hands-on solutions builder").
        role: "Applied AI product manager and hands-on solutions builder",
        title: "I turn AI into products people use.",
        tag: "Applied AI product",
        summary: "I’m Anshul, an applied AI product manager and hands-on solutions builder.",
        body: [
          "I connect real user workflows, model behavior, evaluation, and adoption to move enterprise AI from promising demo to daily work.",
          "Applied AI product leadership, technical systems fluency, enterprise delivery, and a bias toward useful outcomes."
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
        title: "The quality bar behind the work.",
        tag: "Operating principles",
        summary: "A model response is not a product outcome.",
        body: [
          "The complete system includes the workflow, boundaries, evaluation, recovery path, instrumentation, and the reason a user returns.",
          "I pair what people say with what their behavior shows, then define the smallest useful intervention around the real constraint.",
          "Clear tool limits, validation, human review, and deterministic rules make automation useful without pretending uncertainty disappeared."
        ],
        facts: ["Evidence before scope", "Adoption is product work", "Bound autonomy"],
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
        summary: "Leading Rae across product strategy, discovery, requirements, analytics, AI solution design, launches, adoption, and enterprise stakeholder alignment.",
        body: ["I learned the market by studying it, the product by operating it, and AI systems by improving and building them."],
        facts: ["Product roadmap and PRDs", "RAG, search, routing and evaluation", "Activation and enablement systems"],
        links: []
      },
      {
        id: "content-operations",
        title: "Product Content Manager",
        tag: "Twimbit · Sep 2024 — Jan 2025",
        org: "Twimbit", start: "2024-09", end: "2025-01",
        summary: "Built AI-accelerated content operations, combining structured intake, workflow automation, research assistants, and human review.",
        body: ["Built AI-accelerated content operations for a three-person team, combining structured intake, workflow automation, research assistants, and human review."],
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
        summary: "Worked across customer experience, strategy, competitive benchmarking, and AI adoption research for regional technology and financial-services organizations.",
        body: ["Started in consulting research and analysis, translating market evidence into clear recommendations and client-ready stories."],
        facts: ["Consultant Analyst · Jan 2024 — Sep 2024", "Advisory Maverick · Sep 2023 — Dec 2023", "Kuala Lumpur, Malaysia"],
        links: []
      }
    ]
  },
  projects: {
    title: "Projects",
    subtitle: "Work across the full AI product loop.",
    entries: [
      {
        id: "rae",
        title: "Rae",
        tag: "Enterprise B2B AI · Live product",
        summary: "From scattered AI features to an evidence-led product and adoption system.",
        body: [
          "I led product work across discovery, roadmap, requirements, analytics, response quality, launches, enablement, and stakeholder alignment for a live RAG-based sales platform.",
          "A broad sales enablement platform needed clearer priorities, stronger response quality, and a repeatable path from feature release to active use."
        ],
        facts: ["Frontline discovery and behavioral evidence", "RAG, search, routing, prompts, and response quality", "Structured activation and enablement around launches"],
        links: [{ label: "Rae’s public product story", url: "https://explorae.salesrechargekit.ai/#overview" }, {label:"Rae Engage · Live sample",url:"https://business.celcomdigi.com/plan/postpaid-phone"}]
      },
      {
        id: "reengage", title: "Rae Engage", tag: "Customer-facing AI · Public work sample",
        summary: "A focused conversational path from plan discovery to a sales conversation.",
        body: ["I owned the pilot’s problem framing, scope, requirements and stakeholder alignment, and contributed directly to its build.", "The initial experience focused on business mobile-plan questions, guided conversation and lead qualification. The public work sample shows the customer-facing assistant in context."],
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
        summary: "Continuity between appointments.",
        body: [
          "A patient-first, voice-enabled health agent designed to help people stay informed, organized, and engaged between appointments.",
          "Independently scoped, designed, and built the working experience.",
          "Designed the agent to support organization and preparation, not replace clinical judgment."
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
      id: "portfolio-resume", title: "The work, on one page.", tag: "Resume · Existing portfolio PDF",
      // format and issued restate the fact "PDF · July 2026" for the document sleeve.
      format: "PDF", issued: "July 2026",
      summary: "Product strategy, applied AI and hands-on delivery.",
      body: ["Download the resume already included in my portfolio, or open the PDF in a new tab.", "This is the July 2026 AI Product Manager version. The project stories in this archive provide additional context."],
      facts: ["AI Product Manager resume", "PDF · July 2026", "Existing portfolio document"],
      links: [{label:"Download resume",url:"./assets/portfolio/portfolio-resume.pdf",download:true},{label:"Open PDF",url:"./assets/portfolio/portfolio-resume.pdf"}]
    }]
  }

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
